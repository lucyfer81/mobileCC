import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";

import { mustSessionName, safeJson, httpError } from "./util.js";
import { listSessions, hasSession, sendKeys, sendControl, capturePane } from "./tmux.js";
import { createPaneFollower } from "./pane-follower.js";
import { sanitizeTerminalText } from "./terminal-text.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 5002;

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

const streams = new Map();

function getOrCreateStream(sessionName) {
  let s = streams.get(sessionName);
  if (!s) {
    s = { clients: new Set(), follower: null, lastSnapshot: "" };
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

    const stream = getOrCreateStream(name);
    if (!stream.follower) {
      stream.follower = createPaneFollower(
        name,
        (snapshot) => {
          stream.lastSnapshot = snapshot;
          broadcast(name, { type: "snapshot", session: name, data: snapshot });
        },
        (err) => {
          broadcast(name, {
            type: "error",
            session: name,
            error: err?.message || "capture pane failed"
          });
        }
      );
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
    const rawSubmitKey = String(req.body?.submitKey ?? "tab");
    const submitKey = ["ctrl_j", "enter", "esc_enter", "tab"].includes(rawSubmitKey) ? rawSubmitKey : "tab";
    if (!text.trim()) {
      const err = new Error("Empty input");
      err.status = 400;
      throw err;
    }
    await sendKeys(name, text, true, submitKey);
    console.log(`[input] session=${name} submitKey=${submitKey} textLen=${text.length}`);
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
    if (!(await hasSession(name))) {
      const err = new Error(`tmux session not found: ${name}`);
      err.status = 404;
      throw err;
    }
    const lines = Math.max(50, Math.min(5000, Number(req.query.lines || 400)));

    const rawLog = await capturePane(name, -lines, -1);
    const cleanLog = sanitizeTerminalText(rawLog);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(cleanLog);
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
  if (stream.lastSnapshot && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: "snapshot", session: sessionName, data: stream.lastSnapshot }));
  }

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
});
