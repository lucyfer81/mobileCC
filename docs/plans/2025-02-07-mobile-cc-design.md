# MobileCC - tmux 移动端远程控制工具设计文档

**日期:** 2025-02-07
**目标:** 实现一个 Node.js 服务，通过 tmux + WebSocket 实现移动端远程控制 tmux sessions

## 1. 概述

MobileCC 是一个轻量级的 Web 服务，允许用户从移动设备（手机浏览器）连接和控制服务器上运行的 tmux sessions。适用于随时远程监控和操作长时间运行的命令行任务（如 Claude Code）。

### 核心功能

- 列出所有可用的 tmux sessions
- 支持手动输入 session 名称连接
- 实时显示 tmux 输出（WebSocket 推送）
- 发送命令输入到 tmux session
- ANSI 控制码清理（提升手机阅读体验）
- 输入活动提示（避免多端输入混淆）
- 断线重连支持（历史日志）

### 技术栈

- **后端:** Node.js + Express + ws (WebSocket)
- **前端:** 纯 HTML/CSS/JavaScript（无框架）
- **集成:** tmux 命令行工具
- **端口:** 5002（可通过环境变量配置）

## 2. 架构设计

### 2.1 目录结构

```
mobileCC/
  package.json
  src/
    server.js       # Express + WebSocket 服务器
    tmux.js         # tmux 命令封装
    tail.js         # 日志追踪 + ANSI 清理
    util.js         # 工具函数
  public/
    index.html      # session 列表页
    session.html    # session 连接页
    app.js          # 列表页逻辑
    session.js      # 连接页逻辑（含输入提示 UI）
    style.css       # 样式
  data/
    logs/           # tmux 输出日志目录
```

### 2.2 数据流

**输出流（tmux → 浏览器）**
```
tmux session → pipe-pane → 日志文件 → tail -F → ANSI 清理 → WebSocket → 浏览器渲染
```

**输入流（浏览器 → tmux）**
```
浏览器输入 → REST API (/input) → tmux send-keys → tmux session
```

### 2.3 核心模块

#### tmux.js - tmux 交互封装

**函数列表:**
- `listSessions()` - 列出所有 tmux sessions
- `hasSession(name)` - 检查 session 是否存在
- `ensureLogDir()` - 确保日志目录存在
- `logPathFor(logDir, sessionName)` - 获取日志文件路径
- `ensurePipePane(sessionName, logFile)` - 设置 pipe-pane 捕获输出
- `sendKeys(sessionName, text, enter)` - 发送文本到 session
- `sendControl(sessionName, action)` - 发送控制命令（C-c, Enter）

**要点:**
- 所有 tmux 命令使用 `execFileAsync` 执行
- `listSessions()` 在无 server 时返回空数组（不抛错）
- pipe-pane 针对 session 的第一个 pane (`${sessionName}:0.0`)

#### tail.js - 日志追踪和 ANSI 清理

**函数列表:**
- `stripAnsi(text)` - 清理 ANSI 控制码
- `createTailFollower(logFile, onLine)` - 启动 tail -F 进程

**ANSI 清理实现:**
```javascript
function stripAnsi(text) {
  // 移除 CSI 序列：ESC[ ... m/K/H 等（颜色、光标）
  let cleaned = text.replace(/\x1b\[[0-9;]*[mGKHfABCD]/g, '');
  // 移除操作系统命令
  cleaned = cleaned.replace(/\x1b\][^\x07]*\x07/g, '');
  cleaned = cleaned.replace(/\x1b\][^\x1b]*\x1b\\/g, '');
  return cleaned;
}
```

**要点:**
- 使用 `tail -n 200 -F` 追踪日志
- 按行分割，每次回调传递一行清理后的文本
- 返回 `stop()` 方法用于停止 tail 进程

#### server.js - HTTP + WebSocket 服务器

**状态管理:**
```javascript
const streams = new Map(); // sessionName -> { clients: Set<WebSocket>, follower }
```

**REST API:**
- `GET /api/sessions` - 获取 session 列表
- `POST /api/sessions/:name/attach` - 连接 session，启动 pipe-pane 和 tail
- `POST /api/sessions/:name/input` - 发送输入到 session
- `POST /api/sessions/:name/control` - 发送控制命令
- `GET /api/sessions/:name/log?tail=N` - 获取历史日志

**WebSocket:**
- 路径: `/ws?session=<name>`
- 消息类型:
  - `{ type: 'chunk', session, data }` - 输出数据
  - `{ type: 'input-activity', source, timestamp }` - 输入活动通知

**要点:**
- attach 时自动启动 pipe-pane 和 tail follower
- 无订阅者时停止 tail 节省资源
- 输入活动广播到所有订阅者

### 2.4 输入活动提示（简化版）

**设计原则:** 轻量提醒，不强制锁定

- 任何端发送输入时，WebSocket 广播 `input-activity` 事件
- 其他端收到后显示 toast 提示："📱 手机刚刚输入了内容"
- 提示 3 秒后自动淡出
- **不阻止任何端输入**

**实现:**
- 服务端: `/input` API 调用时广播 activity
- 客户端: 显示淡入淡出的 toast div

## 3. 前端设计

### 3.1 列表页 (index.html)

**布局:**
- 顶部输入框: 手动输入 session 名称 + "连接"按钮
- 刷新按钮 + 自动加载的 session 列表
- 每个 session: pill 样式名称 + "打开"链接

**脚本 (app.js):**
- 页面加载时自动调用 `/api/sessions`
- "刷新"按钮重新加载
- "连接"按钮跳转到 `/session.html?session=<name>`

### 3.2 连接页 (session.html)

**布局:**
```
┌─────────────────────────────┐
│ ← back | session: xxx | conn │ 顶部栏
├─────────────────────────────┤
│                             │
│  Output (60vh)              │ 主输出区
│  - 自动滚动                  │ - pre.textContent 追加
│  - 手动滚动时显示"跳到最新"   │ - scroll 事件检测位置
│                             │
├─────────────────────────────┤
│ [Yes] [No] [Enter] Prompt?  │ Prompt 按钮（条件显示）
├─────────────────────────────┤
│ [输入框___________] [Send]  │
│ [Ctrl+C]                    │ 操作按钮
│ 自动滚动: ON [跳到最新]      │ 状态
└─────────────────────────────┘
```

**脚本 (session.js):**
1. **初始化:**
   - 调用 `/attach` API 启动捕获
   - 调用 `/log` API 加载历史日志
   - 建立 WebSocket 连接

2. **WebSocket 消息处理:**
   - `chunk` → `append()` 追加输出
   - `input-activity` → 显示 toast 提示

3. **输入处理:**
   - 输入框 + Send 按钮 → `/input` API
   - Ctrl+C 按钮 → `/control` API (action=ctrl_c)
   - Prompt 按钮 → 发送 "y", "n", 或 Enter

4. **自动滚动逻辑:**
   - 默认自动滚动到底部
   - 用户手动滚动时停止自动滚动，显示"跳到最新"按钮
   - 点击"跳到最新"恢复自动滚动

### 3.3 样式 (style.css)

**主题:** 深色，开发人员友好
- 背景: `#0b0f14`
- 主容器: `#0f1621`
- 文字: `#e6edf3`
- 强调色: `#1b4ddb` (蓝色), `#7a1b1b` (红色)
- 字体: 等宽字体

**响应式:** 手机竖屏优化，大按钮触摸友好

## 4. 错误处理

### 4.1 服务端

**tmux 错误:**
- `listSessions()` - 无 server 时返回空数组
- `hasSession()` - 捕获错误返回 false
- 其他命令失败 → 抛出错误

**HTTP 响应:**
- 400 - 无效 session 名称、空输入
- 404 - session 不存在、日志不存在
- 500 - 内部错误
- 统一格式: `{ error: "描述" }`

**WebSocket:**
- 无效 session → 关闭连接 (code 1008)
- tail 崩溃 → 停止 follower
- 客户端断开 → 清理 clients，无订阅者时停止 tail

### 4.2 客户端

- API 失败 → 输出区显示 `[client] 错误信息`
- WebSocket 断开 → 状态栏显示 "ws closed"
- attach 失败 → 状态栏显示具体原因

## 5. 部署

### 5.1 启动

```bash
npm install
npm start  # 默认 http://127.0.0.1:5002
```

### 5.2 环境变量

- `PORT` - 服务端口（默认 5002）
- `LOG_DIR` - 日志目录（默认 ./data/logs）

### 5.3 反向代理

建议使用 Cloudflare Tunnel 暴露到公网，或使用 nginx/caddy 配置 HTTPS。

## 6. 使用流程

1. **服务器上启动 tmux session:**
   ```bash
   tmux new -s mysession
   cd /path/to/repo
   claude code
   ```

2. **手机访问:**
   - 打开列表页，选择或输入 session 名称
   - 进入连接页，实时查看和操作

3. **断线重连:**
   - 刷新页面自动加载历史日志
   - WebSocket 重新连接，继续实时接收输出

## 7. 后续增强（可选）

- 支持多 pane（选择 window.pane）
- 输入历史记录
- 日志搜索
- 多语言支持
