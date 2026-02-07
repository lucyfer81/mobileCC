# MobileCC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 tmux 移动端远程控制工具，支持实时输出查看、命令输入、ANSI 清理和输入活动提示

**Architecture:** Node.js + Express + WebSocket 服务端，纯 HTML/CSS/JS 客户端，通过 tmux 命令行工具与现有 sessions 交互

**Tech Stack:** Node.js (ES modules), Express, ws (WebSocket), tmux, 纯前端无框架

---

## Task 1: 初始化项目结构

**Files:**
- Create: `package.json`
- Create: `src/util.js`
- Create: `src/tmux.js`
- Create: `src/tail.js`
- Create: `src/server.js`
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/session.html`
- Create: `public/session.js`
- Create: `public/style.css`
- Create: `data/logs/.gitkeep`

**Step 1: 创建 package.json**

```bash
cat > package.json << 'EOF'
{
  "name": "mobilecc",
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
EOF
```

**Step 2: 创建目录结构**

```bash
mkdir -p src public data/logs
touch data/logs/.gitkeep
```

**Step 3: 初始化 git 并提交**

```bash
git init
git add package.json data/logs/.gitkeep
git commit -m "feat: initialize project with package.json"
```

---

## Task 2: 实现工具函数模块 (src/util.js)

**Files:**
- Create: `src/util.js`

**Step 1: 创建工具函数文件**

```javascript
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

**Step 2: 提交**

```bash
git add src/util.js
git commit -m "feat: add utility functions for validation and HTTP responses"
```

---

## Task 3: 实现 tmux 交互模块 (src/tmux.js)

**Files:**
- Create: `src/tmux.js`

**Step 1: 创建 tmux 模块**

```javascript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

async function tmux(args) {
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
  return path.join(logDir, `${sessionName}.log`);
}

export async function ensurePipePane(sessionName, logFile) {
  await fs.appendFile(logFile, "");
  const target = `${sessionName}:0.0`;
  await tmux(["pipe-pane", "-t", target, "-o", `cat >> ${escapeShellArg(logFile)}`]);
}

export async function sendKeys(sessionName, text, enter = true) {
  const target = `${sessionName}:0.0`;
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
  return `'${String(p).replace(/'/g, `'\\''`)}'`;
}
```

**Step 2: 提交**

```bash
git add src/tmux.js
git commit -m "feat: implement tmux interaction module"
```

---

## Task 4: 实现日志追踪和 ANSI 清理模块 (src/tail.js)

**Files:**
- Create: `src/tail.js`

**Step 1: 创建 tail 模块**

```javascript
import { spawn } from "node:child_process";

function stripAnsi(text) {
  let cleaned = text.replace(/\x1b\[[0-9;]*[mGKHfABCD]/g, '');
  cleaned = cleaned.replace(/\x1b\][^\x07]*\x07/g, '');
  cleaned = cleaned.replace(/\x1b\][^\x1b]*\x1b\\/g, '');
  cleaned = cleaned.replace(/\x1b\[?[0-9;]*[A-Z]/g, '');
  return cleaned;
}

export function createTailFollower(logFile, onLine) {
  const child = spawn("tail", ["-n", "200", "-F", logFile], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx + 1);
      buf = buf.slice(idx + 1);
      onLine(stripAnsi(line));
    }
    if (buf.length > 8192) {
      onLine(stripAnsi(buf));
      buf = "";
    }
  });

  child.stderr.on("data", () => {});

  return {
    stop() {
      child.kill("SIGTERM");
    }
  };
}
```

**Step 2: 提交**

```bash
git add src/tail.js
git commit -m "feat: implement log tail follower with ANSI stripping"
```

---

## Task 5: 实现服务器核心 (src/server.js) - REST API 部分

**Files:**
- Create: `src/server.js` (part 1)

**Step 1: 创建服务器文件 - 基础设置和 API**

```javascript
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
```

**Step 2: 提交 REST API 部分**

```bash
git add src/server.js
git commit -m "feat: implement REST API endpoints for session management"
```

---

## Task 6: 完成服务器 - WebSocket 部分

**Files:**
- Modify: `src/server.js`

**Step 1: 添加 WebSocket 服务器代码**

在 `src/server.js` 末尾追加：

```javascript
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
```

**Step 2: 提交 WebSocket 部分**

```bash
git add src/server.js
git commit -m "feat: implement WebSocket server for real-time output"
```

---

## Task 7: 创建前端样式 (public/style.css)

**Files:**
- Create: `public/style.css`

**Step 1: 创建样式文件**

```css
:root {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

body {
  margin: 0;
  background: #0b0f14;
  color: #e6edf3;
}

a {
  color: #8ab4f8;
  text-decoration: none;
}

.container {
  max-width: 980px;
  margin: 0 auto;
  padding: 16px;
}

.card {
  background: #0f1621;
  border: 1px solid #1f2a3a;
  border-radius: 12px;
  padding: 12px;
  margin: 12px 0;
}

.row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

input, button {
  font: inherit;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #2b3a52;
  background: #0b1220;
  color: #e6edf3;
}

button {
  cursor: pointer;
}

button.primary {
  background: #1b4ddb;
  border-color: #2b5fff;
}

button.danger {
  background: #7a1b1b;
  border-color: #a33;
}

.small {
  opacity: 0.85;
  font-size: 12px;
}

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

.pills {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 10px 0;
}

.pill {
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid #2b3a52;
  background: #0b1220;
}

.toast {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(27, 77, 219, 0.9);
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
  z-index: 1000;
}

.toast.show {
  opacity: 1;
}
```

**Step 2: 提交**

```bash
git add public/style.css
git commit -m "feat: add frontend styles with dark theme"
```

---

## Task 8: 创建列表页 HTML (public/index.html)

**Files:**
- Create: `public/index.html`

**Step 1: 创建列表页**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MobileCC</title>
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

**Step 2: 提交**

```bash
git add public/index.html
git commit -m "feat: add session list page HTML"
```

---

## Task 9: 创建列表页脚本 (public/app.js)

**Files:**
- Create: `public/app.js`

**Step 1: 创建列表页脚本**

```javascript
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
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

document.getElementById("refreshBtn").onclick = load;

document.getElementById("goBtn").onclick = () => {
  const name = document.getElementById("manualName").value.trim();
  if (!name) return;
  location.href = `/session.html?session=${encodeURIComponent(name)}`;
};

load();
```

**Step 2: 提交**

```bash
git add public/app.js
git commit -m "feat: add session list page functionality"
```

---

## Task 10: 创建连接页 HTML (public/session.html)

**Files:**
- Create: `public/session.html`

**Step 1: 创建连接页**

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
  <div id="toast" class="toast"></div>

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

**Step 2: 提交**

```bash
git add public/session.html
git commit -m "feat: add session connection page HTML"
```

---

## Task 11: 创建连接页脚本 (public/session.js)

**Files:**
- Create: `public/session.js`

**Step 1: 创建连接页脚本**

```javascript
const params = new URLSearchParams(location.search);
const session = params.get("session");

document.getElementById("title").textContent = session ? `session: ${session}` : "session: (missing)";
const conn = document.getElementById("conn");
const pre = document.getElementById("pre");
const out = document.getElementById("output");
const toast = document.getElementById("toast");

let autoScroll = true;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

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

async function sendInput(text) {
  const r = await fetch(`/api/sessions/${encodeURIComponent(session)}/input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    append(`\n[client] send failed: ${j.error || r.status}\n`);
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
    if (msg.type === "input-activity") showToast("📱 其他设备刚刚输入了内容");
  };
}

main();
```

**Step 2: 提交**

```bash
git add public/session.js
git commit -m "feat: add session connection page with WebSocket and input activity toast"
```

---

## Task 12: 安装依赖并测试启动

**Files:**
- (no new files)

**Step 1: 安装依赖**

```bash
npm install
```

Expected: `node_modules/` 目录创建，express 和 ws 安装成功

**Step 2: 提交 package-lock.json**

```bash
git add package-lock.json
git commit -m "chore: add package-lock.json"
```

**Step 3: 测试启动服务器**

```bash
node src/server.js &
echo $! > server.pid
sleep 2
curl http://127.0.0.1:5002/api/sessions
```

Expected: 服务器启动，返回 JSON 响应（可能是空 sessions 列表）

**Step 4: 停止测试服务器**

```bash
kill $(cat server.pid) 2>/dev/null || true
rm server.pid
```

**Step 5: 提交完成标记**

```bash
echo "# MobileCC

tmux 移动端远程控制工具

## 快速开始

\`\`\`bash
npm install
npm start
\`\`\`

访问 http://127.0.0.1:5002

## 使用方法

1. 在服务器上创建 tmux session:
   \`\`\`bash
   tmux new -s mysession
   \`\`\`

2. 在手机浏览器访问列表页，选择 session 连接

" > README.md

git add README.md
git commit -m "docs: add README with usage instructions"
```

---

## Task 13: 手动测试完整流程

**Files:**
- (no new files)

**Step 1: 创建测试 tmux session**

```bash
tmux new -s test_session -d
tmux send-keys -t test_session "echo 'Hello from MobileCC!'" Enter
tmux send-keys -t test_session "sleep 3600" Enter
```

**Step 2: 启动服务器**

```bash
node src/server.js &
echo $! > server.pid
sleep 2
```

**Step 3: 测试 API**

```bash
# 测试列表 API
curl http://127.0.0.1:5002/api/sessions

# 测试 attach API
curl -X POST http://127.0.0.1:5002/api/sessions/test_session/attach

# 等待几秒让日志写入
sleep 3

# 测试日志 API
curl http://127.0.0.1:5002/api/sessions/test_session/log

# 测试输入 API
curl -X POST http://127.0.0.1:5002/api/sessions/test_session/input \
  -H "Content-Type: application/json" \
  -d '{"text":"echo test input"}'

# 测试控制 API
curl -X POST http://127.0.0.1:5002/api/sessions/test_session/control \
  -H "Content-Type: application/json" \
  -d '{"action":"ctrl_c"}'
```

**Step 4: 清理**

```bash
kill $(cat server.pid) 2>/dev/null || true
rm server.pid
tmux kill-session -t test_session 2>/dev/null || true
```

**Step 5: 最终提交**

```bash
git add .
git commit -m "test: verify implementation with manual testing"
```

---

## 完成检查清单

- [ ] 所有文件已创建
- [ ] 所有代码已提交
- [ ] 服务器能正常启动
- [ ] API 端点响应正确
- [ ] WebSocket 连接正常
- [ ] ANSI 清理工作正常
- [ ] 输入活动提示显示
- [ ] README 文档完整

---

## 部署建议

1. **本地开发**: 直接 `npm start`
2. **生产环境**: 使用 PM2 或 systemd 管理进程
3. **反向代理**: 使用 nginx 或 Cloudflare Tunnel
4. **环境变量**: 设置 PORT 和 LOG_DIR
5. **日志轮转**: 配置 logrotate 管理 data/logs/ 目录
