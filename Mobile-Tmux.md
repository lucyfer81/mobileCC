下面给你一个**在 Ubuntu 上可直接跑起来**的 Node 全栈方案（纯 HTML UI），走你想要的 **tmux 托管 + 手机端连接已有 session** 路线，并且支持你说的：**tmux session 名称在手机端输入**。

核心思路：

- Claude Code 正常跑在 `tmux` session 里（你在电脑/SSH 里启动，或用脚本启动）。
    
- Node 服务提供一个 Web UI：
    
    - 列出当前 tmux sessions
        
    - 也允许你手动输入一个 session 名来连接
        
- Node 通过 tmux：
    
    - `pipe-pane` 把该 pane 输出复制到日志文件（用于实时推送、断线重连）
        
    - `send-keys` 把手机输入注入到 session
        
- WebSocket 推送日志增量到手机页面
    

---

## 0. 先决条件（Ubuntu）

```bash
sudo apt update
sudo apt install -y tmux nodejs npm
# 你的 claude code CLI 已安装并可在服务器上运行，比如 `claude code`
```

> 注意：Node 版本建议 >= 18（Ubuntu 默认可能较旧，必要时装 nvm / NodeSource）。

---

## 1. 项目结构

```
claude-remote/
  package.json
  src/
    server.js
    tmux.js
    tail.js
    util.js
  public/
    index.html
    session.html
    app.js
    session.js
    style.css
  data/
    logs/
```

---

## 2. 代码（可直接复制）

### package.json

```json
{
  "name": "claude-remote",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "ws": "^8.18.0"
  }
}
```

---

### src/util.js

```js
export function mustSessionName(name) {
  const s = String(name || "").trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(s)) {
    const err = new Error("Invalid session name. Use [A-Za-z0-9._-], length 1-64.");
    err.status = 400;
    throw err;
  }
  return s;
}

export function safeJson(res, obj, status = 200) {
  res.status(status).json(obj);
}

export function httpError(res, err) {
  const status = err?.status || 500;
  res.status(status).json({
    error: err?.message || "Internal error"
  });
}
```

---

### src/tmux.js

```js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

async function tmux(args) {
  // tmux exits non-zero if no server/sessions; handle in callers
  return await execFileAsync("tmux", args, { encoding: "utf8" });
}

export async function listSessions() {
  try {
    const { stdout } = await tmux(["list-sessions", "-F", "#{session_name}"]);
    return stdout
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);
  } catch (e) {
    // no server running / no sessions => treat as empty
    return [];
  }
}

export async function hasSession(sessionName) {
  try {
    await tmux(["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}

export async function ensureLogDir(logDir) {
  await fs.mkdir(logDir, { recursive: true });
}

export function logPathFor(logDir, sessionName) {
  // one file per session
  return path.join(logDir, `${sessionName}.log`);
}

/**
 * Ensure pipe-pane is set for session's first pane (0.0).
 * - Uses -o to not override existing pipe if already set.
 * - Appends to a log file.
 */
export async function ensurePipePane(sessionName, logFile) {
  // ensure file exists
  await fs.appendFile(logFile, "");
  // pipe pane of window 0 pane 0: `${sessionName}:0.0`
  const target = `${sessionName}:0.0`;
  // Use bash -lc to handle redirection safely
  // tmux: pipe-pane -t <target> -o "cat >> logfile"
  await tmux(["pipe-pane", "-t", target, "-o", `cat >> ${escapeShellArg(logFile)}`]);
}

export async function sendKeys(sessionName, text, enter = true) {
  const target = `${sessionName}:0.0`;
  // tmux send-keys sends literal keys; for text, pass as one arg (tmux handles it)
  // But safest is to send in chunks if huge; MVP: single string.
  await tmux(["send-keys", "-t", target, text]);
  if (enter) {
    await tmux(["send-keys", "-t", target, "Enter"]);
  }
}

export async function sendControl(sessionName, action) {
  const target = `${sessionName}:0.0`;
  if (action === "ctrl_c") {
    await tmux(["send-keys", "-t", target, "C-c"]);
    return;
  }
  if (action === "enter") {
    await tmux(["send-keys", "-t", target, "Enter"]);
    return;
  }
  const err = new Error("Unknown control action");
  err.status = 400;
  throw err;
}

function escapeShellArg(p) {
  // wrap with single quotes and escape existing ones
  return `'${String(p).replace(/'/g, `'\\''`)}'`;
}
```

---

### src/tail.js

用 `tail -n 200 -F logfile` 最省事、也最稳（断线/rotate 也能跟）。

```js
import { spawn } from "node:child_process";

export function createTailFollower(logFile, onLine) {
  // tail -n 200 -F <file>
  const child = spawn("tail", ["-n", "200", "-F", logFile], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    // 不强行按行切分也行，但按行能更容易做 prompt 识别
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx + 1);
      buf = buf.slice(idx + 1);
      onLine(line);
    }
    if (buf.length > 8192) {
      // 防止极端情况无限增长
      onLine(buf);
      buf = "";
    }
  });

  child.stderr.on("data", () => { /* ignore */ });

  return {
    stop() {
      child.kill("SIGTERM");
    }
  };
}
```

---

### src/server.js

```js
import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";

import { mustSessionName, safeJson, httpError } from "./util.js";
import { listSessions, hasSession, ensureLogDir, logPathFor, ensurePipePane, sendKeys, sendControl } from "./tmux.js";
import { createTailFollower } from "./tail.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), "data", "logs");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

await ensureLogDir(LOG_DIR);

// In-memory: sessionName -> { clients:Set(ws), follower }
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

// --- REST APIs ---

app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await listSessions();
    safeJson(res, { sessions });
  } catch (e) {
    httpError(res, e);
  }
});

// Attach: ensure session exists, ensure pipe-pane, start tail follower, return ok + log url
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
        // 简易 prompt 识别：如果命中，发 prompt 事件（前端显示按钮）
        if (looksLikePrompt(chunk)) {
          broadcast(name, { type: "prompt", session: name, hint: chunk.trim() });
        }
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

// tail log for reconnect
app.get("/api/sessions/:name/log", async (req, res) => {
  try {
    const name = mustSessionName(req.params.name);
    const logFile = logPathFor(LOG_DIR, name);
    // naive: use tail command for simplicity
    const tailBytes = Math.max(1000, Math.min(200_000, Number(req.query.tail || 20_000)));
    // Stream last N bytes
    const fs = await import("node:fs");
    fs.default.stat(logFile, (err, st) => {
      if (err) return res.status(404).send("log not found");
      const start = Math.max(0, st.size - tailBytes);
      const rs = fs.default.createReadStream(logFile, { start, end: st.size });
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      rs.pipe(res);
    });
  } catch (e) {
    httpError(res, e);
  }
});

function looksLikePrompt(s) {
  const t = String(s);
  return (
    /\[(y\/n|Y\/N|y\/N|Y\/n)\]/.test(t) ||
    /Proceed\?/i.test(t) ||
    /Continue\?/i.test(t) ||
    /Press\s+Enter/i.test(t) ||
    /Are you sure/i.test(t)
  );
}

// --- WS ---

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
    // 如果没人订阅，可以选择停掉 tail（可选）
    if (stream.clients.size === 0 && stream.follower) {
      stream.follower.stop();
      stream.follower = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`claude-remote listening on http://127.0.0.1:${PORT}`);
  console.log(`LOG_DIR=${LOG_DIR}`);
});
```

---

## 3. 前端（纯 HTML）

### public/style.css

```css
:root { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
body { margin: 0; background: #0b0f14; color: #e6edf3; }
a { color: #8ab4f8; text-decoration: none; }
.container { max-width: 980px; margin: 0 auto; padding: 16px; }
.card { background: #0f1621; border: 1px solid #1f2a3a; border-radius: 12px; padding: 12px; margin: 12px 0; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
input, button { font: inherit; padding: 10px 12px; border-radius: 10px; border: 1px solid #2b3a52; background: #0b1220; color: #e6edf3; }
button { cursor: pointer; }
button.primary { background: #1b4ddb; border-color: #2b5fff; }
button.danger { background: #7a1b1b; border-color: #a33; }
.small { opacity: 0.85; font-size: 12px; }
pre {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.35;
  font-size: 14px;
}
.output {
  height: 60vh;
  overflow: auto;
  padding: 12px;
  background: #060a10;
  border-radius: 12px;
  border: 1px solid #1f2a3a;
}
.footerBar {
  position: sticky;
  bottom: 0;
  background: rgba(11,15,20,0.92);
  backdrop-filter: blur(6px);
  padding: 12px 0 0 0;
}
.pills { display: flex; gap: 10px; flex-wrap: wrap; margin: 10px 0; }
.pill { padding: 8px 10px; border-radius: 999px; border: 1px solid #2b3a52; background: #0b1220; }
```

---

### public/index.html

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Claude Remote</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="container">
    <h2>tmux sessions</h2>

    <div class="card">
      <div class="row">
        <input id="manualName" placeholder="输入 tmux session 名（例如 cc_foo）" style="flex:1; min-width: 240px;" />
        <button id="goBtn" class="primary">连接</button>
      </div>
      <div class="small">提示：session 名只允许 A-Za-z0-9._-</div>
    </div>

    <div class="card">
      <div class="row">
        <button id="refreshBtn">刷新列表</button>
        <span id="status" class="small"></span>
      </div>
      <div id="list"></div>
    </div>
  </div>

  <script src="/app.js"></script>
</body>
</html>
```

---

### public/app.js

```js
async function load() {
  const status = document.getElementById("status");
  status.textContent = "loading...";
  const res = await fetch("/api/sessions");
  const data = await res.json();
  const list = document.getElementById("list");
  list.innerHTML = "";

  (data.sessions || []).forEach((name) => {
    const div = document.createElement("div");
    div.className = "row";
    div.style.margin = "10px 0";
    div.innerHTML = `
      <span class="pill">${escapeHtml(name)}</span>
      <a href="/session.html?session=${encodeURIComponent(name)}">打开</a>
    `;
    list.appendChild(div);
  });

  status.textContent = `found ${data.sessions?.length || 0}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.getElementById("refreshBtn").onclick = load;

document.getElementById("goBtn").onclick = () => {
  const name = document.getElementById("manualName").value.trim();
  if (!name) return;
  location.href = `/session.html?session=${encodeURIComponent(name)}`;
};

load();
```

---

### public/session.html

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Session</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="container">
    <div class="row">
      <a href="/">← back</a>
      <span id="title" class="pill"></span>
      <span id="conn" class="small"></span>
    </div>

    <div class="card">
      <div class="output" id="output"><pre id="pre"></pre></div>

      <div class="footerBar">
        <div class="pills" id="promptBar" style="display:none;">
          <span class="pill">Prompt:</span>
          <button id="yesBtn" class="primary">Yes (y)</button>
          <button id="noBtn" class="danger">No (n)</button>
          <button id="enterBtn">Enter</button>
          <span id="promptHint" class="small"></span>
        </div>

        <div class="row">
          <input id="input" placeholder="输入内容，回车发送" style="flex:1; min-width: 220px;" />
          <button id="sendBtn" class="primary">Send</button>
          <button id="ctrlcBtn" class="danger">Ctrl+C</button>
        </div>

        <div class="small" style="margin-top:8px;">
          自动滚动：<span id="autoscroll" class="pill">ON</span>
          <button id="jumpBtn" style="display:none;">跳到最新</button>
        </div>
      </div>
    </div>
  </div>

  <script src="/session.js"></script>
</body>
</html>
```

---

### public/session.js

```js
const params = new URLSearchParams(location.search);
const session = params.get("session");

document.getElementById("title").textContent = session ? `session: ${session}` : "session: (missing)";
const conn = document.getElementById("conn");
const pre = document.getElementById("pre");
const out = document.getElementById("output");

let autoScroll = true;

function append(text) {
  pre.textContent += text;
  if (autoScroll) {
    out.scrollTop = out.scrollHeight;
  } else {
    document.getElementById("jumpBtn").style.display = "inline-block";
  }
}

out.addEventListener("scroll", () => {
  const nearBottom = (out.scrollHeight - out.scrollTop - out.clientHeight) < 40;
  autoScroll = nearBottom;
  document.getElementById("autoscroll").textContent = autoScroll ? "ON" : "OFF";
  if (autoScroll) document.getElementById("jumpBtn").style.display = "none";
});

document.getElementById("jumpBtn").onclick = () => {
  autoScroll = true;
  out.scrollTop = out.scrollHeight;
  document.getElementById("autoscroll").textContent = "ON";
  document.getElementById("jumpBtn").style.display = "none";
};

async function attach() {
  if (!session) return;
  conn.textContent = "attaching...";
  const r = await fetch(`/api/sessions/${encodeURIComponent(session)}/attach`, { method: "POST" });
  const j = await r.json();
  if (!r.ok) {
    conn.textContent = `attach failed: ${j.error || r.status}`;
    return;
  }
  conn.textContent = "attached";
}

async function loadTail() {
  if (!session) return;
  const r = await fetch(`/api/sessions/${encodeURIComponent(session)}/log?tail=40000`);
  if (r.ok) {
    const t = await r.text();
    pre.textContent = t;
    out.scrollTop = out.scrollHeight;
  }
}

function showPrompt(hint) {
  const bar = document.getElementById("promptBar");
  bar.style.display = "flex";
  document.getElementById("promptHint").textContent = hint || "";
}

function hidePromptSoon() {
  // 简单策略：用户一输入就隐藏
  const bar = document.getElementById("promptBar");
  bar.style.display = "none";
  document.getElementById("promptHint").textContent = "";
}

async function sendInput(text) {
  const r = await fetch(`/api/sessions/${encodeURIComponent(session)}/input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    append(`\n[client] send failed: ${j.error || r.status}\n`);
  } else {
    hidePromptSoon();
  }
}

async function sendCtrl(action) {
  const r = await fetch(`/api/sessions/${encodeURIComponent(session)}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    append(`\n[client] control failed: ${j.error || r.status}\n`);
  } else {
    hidePromptSoon();
  }
}

document.getElementById("sendBtn").onclick = () => {
  const inp = document.getElementById("input");
  const text = inp.value;
  inp.value = "";
  if (text.trim()) sendInput(text);
};

document.getElementById("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("sendBtn").click();
  }
});

document.getElementById("yesBtn").onclick = () => sendInput("y");
document.getElementById("noBtn").onclick = () => sendInput("n");
document.getElementById("enterBtn").onclick = () => sendCtrl("enter");
document.getElementById("ctrlcBtn").onclick = () => sendCtrl("ctrl_c");

async function main() {
  if (!session) {
    append("missing session param\n");
    return;
  }
  await attach();
  await loadTail();

  const wsProto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${wsProto}://${location.host}/ws?session=${encodeURIComponent(session)}`);

  ws.onopen = () => conn.textContent = "ws connected";
  ws.onclose = () => conn.textContent = "ws closed";
  ws.onerror = () => conn.textContent = "ws error";

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "chunk") append(msg.data);
    if (msg.type === "prompt") showPrompt(msg.hint);
  };
}

main();
```

---

## 4. 启动项目

```bash
cd claude-remote
npm install
npm start
# 默认 http://127.0.0.1:8787
```

然后你用 Cloudflare Tunnel 把 `localhost:8787` 暴露到你的 Access 保护域名即可。

---

## 5. 你如何“正确地”在 tmux 里跑 Claude Code

你照常在服务器上：

```bash
tmux new -s mysession
cd /path/to/repo
claude code
```

出门后手机打开网页：

- 列表里点 `mysession`
    
- 或者手动输入 `mysession` 连接
    

> 第一次打开 session 页面时，服务会自动对 `mysession:0.0` 执行 `pipe-pane` 并开始 tail 日志。

---

## 6. 使用上的注意点（很重要但不复杂）

1. **默认只看 window 0 / pane 0（:0.0）**  
    这是 MVP 简化。你如果会在 tmux 里开多 pane，后续可以扩展成在 URL 里加 `pane=0.1`。
    
2. **输出是“终端字节流”**  
    可能包含少量控制字符。MVP 先不处理也能用；需要更干净的话我可以给你加一个轻量清理（去掉常见 ANSI 控制序列）。
    
3. **日志会一直增长**  
    你可以后续加 logrotate，或者每个 session 开新文件按日期切分。
    

---

## 7. 下一步可加但不影响 MVP 的增强

- 在页面上显示 “最后活跃时间 / 是否在等待输入”
    
- “只读模式 / 抢占输入” 简单锁（避免你电脑和手机同时打字打架）
    
- 支持选择 `session:window.pane`
    
- 支持自动扫描 `tmux list-panes` 展示结构
    

---

如果你愿意，我可以在这个可跑版本上再给你加两件最值的东西（都很快）：

1. **ANSI 控制码清理**（手机阅读更舒服）
    
2. **输入锁 / 抢占控制权**（避免多端同时输入导致混乱）
    

你更想先加哪一个？