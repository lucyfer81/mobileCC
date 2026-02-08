import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import fs from "node:fs";

import { mustSessionName, safeJson, httpError } from "./util.js";
import { listSessions, hasSession, ensureLogDir, logPathFor, ensurePipePane, sendKeys, sendControl } from "./tmux.js";
import { createTailFollower } from "./tail.js";
import { readFile } from "node:fs/promises";

// ANSI 清理函数（从 tail.js 复制过来，因为 log API 需要用）
function stripAnsi(text) {
  // 按行处理，对每一行单独处理 \r 覆盖，然后再连接
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    // 先去掉行尾所有连续的 \r（如果有的话）
    let trimmed = line;
    while (trimmed.endsWith('\r')) {
      trimmed = trimmed.slice(0, -1);
    }

    // 如果整行都是空的，直接返回空字符串
    if (!trimmed) {
      return '';
    }

    // 按 \r 分割，只保留最后一段
    const parts = trimmed.split(/\r/);
    const lastPart = parts[parts.length - 1];

    // 如果最后一段是空的，检查是否有其他非空段
    if (!lastPart && parts.length > 1) {
      // 从后往前找第一个非空段
      for (let i = parts.length - 2; i >= 0; i--) {
        if (parts[i]) {
          return parts[i];
        }
      }
    }

    return lastPart;
  });

  let cleaned = processedLines.join('\n');

  // CSI 序列（颜色、光标等）
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[mGKHfABCD]/g, '');
  // DEC 私有模式（? + 数字 + h/l）
  cleaned = cleaned.replace(/\x1b\[[?][0-9;]*[hl]/g, '');
  // OSC 序列
  cleaned = cleaned.replace(/\x1b\][^\x07]*\x07/g, '');
  cleaned = cleaned.replace(/\x1b\][^\x1b]*\x1b\\/g, '');

  // 清理剩余的回车符（CR），只保留换行符（LF）
  cleaned = cleaned.replace(/\r\n/g, '\n');  // Windows CRLF -> LF
  cleaned = cleaned.replace(/\r/g, '');      // 单独 CR 删除

  return cleaned;
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 5002;
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), "data", "logs");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

await ensureLogDir(LOG_DIR);

const streams = new Map();

function getOrCreateStream(sessionName) {
  let s = streams.get(sessionName);
  if (!s) {
    s = { clients: new Set(), follower: null };
    streams.set(sessionName, s);
  }
  return s;
}

function broadcast(sessionName, msgObj) {
  const s = streams.get(sessionName);
  if (!s) return;
  const data = JSON.stringify(msgObj);
  for (const ws of s.clients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await listSessions();
    safeJson(res, { sessions });
  } catch (e) {
    httpError(res, e);
  }
});

app.post("/api/sessions/:name/attach", async (req, res) => {
  try {
    const name = mustSessionName(req.params.name);
    if (!(await hasSession(name))) {
      const err = new Error(`tmux session not found: ${name}`);
      err.status = 404;
      throw err;
    }

    const logFile = logPathFor(LOG_DIR, name);
    await ensurePipePane(name, logFile);

    const stream = getOrCreateStream(name);
    if (!stream.follower) {
      stream.follower = createTailFollower(logFile, (chunk) => {
        broadcast(name, { type: "chunk", session: name, data: chunk });
      });
    }

    safeJson(res, { ok: true, session: name });
  } catch (e) {
    httpError(res, e);
  }
});

app.post("/api/sessions/:name/input", async (req, res) => {
  try {
    const name = mustSessionName(req.params.name);
    const text = String(req.body?.text ?? "");
    if (!text.trim()) {
      const err = new Error("Empty input");
      err.status = 400;
      throw err;
    }
    await sendKeys(name, text, true);
    broadcast(name, { type: "input-activity", source: "unknown", timestamp: Date.now() });
    safeJson(res, { ok: true });
  } catch (e) {
    httpError(res, e);
  }
});

app.post("/api/sessions/:name/control", async (req, res) => {
  try {
    const name = mustSessionName(req.params.name);
    const action = String(req.body?.action ?? "");
    await sendControl(name, action);
    safeJson(res, { ok: true });
  } catch (e) {
    httpError(res, e);
  }
});

app.get("/api/sessions/:name/log", async (req, res) => {
  try {
    const name = mustSessionName(req.params.name);
    const logFile = logPathFor(LOG_DIR, name);
    const tailBytes = Math.max(1000, Math.min(200_000, Number(req.query.tail || 20_000)));

    // 读取文件内容
    const content = await readFile(logFile, 'utf-8');

    // 获取最后 N 字节
    const start = Math.max(0, content.length - tailBytes);
    const rawLog = content.slice(start);

    // 应用 ANSI 清理
    const cleanLog = stripAnsi(rawLog);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(cleanLog);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).send("log not found");
    }
    httpError(res, e);
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const session = url.searchParams.get("session");
  let sessionName = null;

  try {
    sessionName = mustSessionName(session);
  } catch {
    ws.close(1008, "invalid session");
    return;
  }

  const stream = getOrCreateStream(sessionName);
  stream.clients.add(ws);

  ws.on("close", () => {
    stream.clients.delete(ws);
    if (stream.clients.size === 0 && stream.follower) {
      stream.follower.stop();
      stream.follower = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`mobilecc listening on http://127.0.0.1:${PORT}`);
  console.log(`LOG_DIR=${LOG_DIR}`);
});
