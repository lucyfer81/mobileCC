import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import fs from "node:fs";

import { mustSessionName, safeJson, httpError } from "./util.js";
import { listSessions, hasSession, ensureLogDir, logPathFor, ensurePipePane, sendKeys, sendControl } from "./tmux.js";
import { createTailFollower } from "./tail.js";

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
    fs.stat(logFile, (err, st) => {
      if (err) return res.status(404).send("log not found");
      const start = Math.max(0, st.size - tailBytes);
      const rs = fs.createReadStream(logFile, { start, end: st.size });
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      rs.pipe(res);
    });
  } catch (e) {
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
