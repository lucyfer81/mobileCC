# MobileCC

> 📱 A mobile-friendly remote control tool for tmux - Manage and operate your tmux sessions from your phone

MobileCC is a Node.js-based web application that allows you to remotely control tmux sessions on your server through a mobile browser. It's particularly useful for monitoring long-running command-line tasks on mobile devices, such as Claude Code development sessions.

> 📱 tmux 移动端远程控制工具 - 在手机上轻松管理和操作你的 tmux sessions

MobileCC 是一个基于 Node.js 的 Web 应用，允许你通过手机浏览器远程控制服务器上的 tmux sessions。特别适合在移动设备上监控长时间运行的命令行任务，如 Claude Code 开发会话。

## 💡 Project Positioning / 项目定位

**MobileCC is a lightweight tool designed for personal use, inspired by the open-source project [Happy Coder](https://github.com/slopus/happy).**

**MobileCC 是一个专为个人使用设计的轻量级工具，灵感来源于开源项目 [Happy Coder](https://github.com/slopus/happy)。**

Happy Coder is an excellent mobile client for Claude Code/Codex that enables developers to view and control AI programming assistants on their phones. MobileCC borrows the concept of "mobile remote control" and applies it to tmux session management.

Happy Coder 是一个优秀的 Claude Code/Codex 移动端客户端，让开发者能够在手机上查看和控制 AI 编程助手。MobileCC 借鉴了"移动端远程控制"这一理念，将其应用于 tmux session 管理。

### ✅ Project Goals / 本项目的目标

- A simple tmux mobile control solution for personal use / 为个人提供简洁的 tmux 移动端控制方案
- Mobile-friendly interface design / 移动端友好的界面设计
- Real-time viewing and management of tmux sessions / 实时查看和管理 tmux sessions
- Lightweight deployment with no complex dependencies / 轻量级部署，无复杂依赖
- Designed to work with security solutions like Cloudflare Zero Trust / 配合 Cloudflare Zero Trust 等安全方案使用

### ❌ What This Project Does NOT Do / 本项目明确不做的

- **Multi-user System** - No multi-user management; each user deploys their own instance / **多用户系统** - 不支持多用户管理，每个用户部署独立实例
- **Permission Management** - No built-in user authentication or permission control / **权限管理** - 不内置用户认证和权限控制
- **Session Isolation** - All tmux sessions are visible to visitors / **会话隔离** - 所有 tmux sessions 对访问者可见
- **Production-grade Security** - Security relies on external solutions (e.g., Cloudflare Zero Trust) / **生产级安全** - 安全依赖外部方案（如 Cloudflare Zero Trust）

### 🔒 Recommended Security Solutions / 推荐的安全部署方案

For personal use, it's recommended to use the following solutions to secure your internal network:

个人使用场景下，建议配合以下方案保护内网安全：

- **Cloudflare Zero Trust / Cloudflare Access** - Provides identity verification and zero-trust network access / **Cloudflare Zero Trust / Cloudflare Access** - 提供身份验证和零信任网络访问
- **Cloudflare Tunnel** - Securely expose internal services without opening server ports / **Cloudflare Tunnel** - 安全暴露内网服务，无需开放端口
- **Internal Network Deployment** - Use within LAN only, access via VPN / **内网部署** - 仅在局域网内使用，配合 VPN 访问

**Security Assumption:** With Cloudflare Zero Trust protection, all visitors are trusted personal users, so no additional authentication or permission mechanisms are implemented.

**本项目的安全假设：** 在 Cloudflare Zero Trust 保护下，所有访问者都是可信的个人用户，因此不实现额外的认证和权限机制。

## ✨ Features / 特性

- 🎯 **Real-time Output Viewing** - WebSocket pushes tmux session output in real-time / **实时输出查看** - WebSocket 实时推送 tmux session 输出
- 📝 **Command Input** - Send commands to tmux sessions from your phone / **命令输入** - 在手机上发送命令到 tmux session
- 🎨 **ANSI Cleaning** - Automatically strips ANSI control codes for cleaner mobile reading / **ANSI 清理** - 自动清理 ANSI 控制码，手机阅读更清爽
- 🔔 **Input Activity Notifications** - Friendly prompts when multiple devices are inputting / **输入活动提示** - 多端输入时显示友好的提示信息
- 🔄 **Reconnection Support** - Automatically loads history logs for seamless session recovery / **断线重连** - 自动加载历史日志，无缝恢复会话
- 🌙 **Dark Theme** - Eye-friendly dark interface optimized for mobile / **深色主题** - 护眼的深色界面，移动端优化
- 🚀 **Lightweight** - Pure HTML/CSS/JS frontend, no framework dependencies / **轻量级** - 纯 HTML/CSS/JS 前端，无框架依赖

## 📸 Screenshots / 截图

### Session List Page / Session 列表页

![Session List Page](docs/screenshots/mobile_list.png)

Select or enter a tmux session name to connect, with quick access to frequently used sessions.

选择或输入 tmux session 名称进行连接，支持快速访问常用会话。

### Session Connection Page / Session 连接页

![Session Connection Page](docs/screenshots/mobile_session.png)

View tmux output in real-time, send commands, and use quick action buttons.

实时查看 tmux 输出，发送命令，使用快捷按钮操作。

## 🚀 Quick Start / 快速开始

### Prerequisites / 前置要求

- Node.js >= 18
- tmux
- npm or yarn

### Installation / 安装

```bash
# Clone repository / 克隆仓库
git clone https://github.com/lucyfer81/mobileCC.git
cd mobileCC

# Install dependencies / 安装依赖
npm install
```

### Start / 启动

```bash
npm start
```

The server runs on http://127.0.0.1:5002 by default.

服务器默认运行在 http://127.0.0.1:5002

### Optional Environment Variables / 配置环境变量（可选）

```bash
# Custom port / 自定义端口
PORT=3000 npm start

# Custom log directory / 自定义日志目录
LOG_DIR=/var/log/mobilecc npm start
```

## 📖 Usage / 使用方法

### 1. Create a tmux session on your server / 在服务器上创建 tmux session

```bash
tmux new -s mysession
```

### 2. Run your commands in the tmux session / 在 tmux session 中运行你的命令

```bash
cd /path/to/your/project
claude code
# Or any long-running command / 或任何长时间运行的命令
```

### 3. Access the list page from your mobile browser / 在手机浏览器访问列表页

Open your mobile browser and visit:
- Local: http://your-server-ip:5002
- Or via Cloudflare Tunnel / nginx reverse proxy domain

打开手机浏览器，访问：
- 本地：http://your-server-ip:5002
- 或通过 Cloudflare Tunnel / nginx 反向代理的域名

### 4. Select or enter a session name to connect / 选择或输入 session 名称连接

- Select an existing tmux session from the list / 从列表中选择现有的 tmux session
- Or manually enter the session name (e.g., `mysession`) / 或手动输入 session 名称（例如 `mysession`）

### 5. Start remote operation / 开始远程操作

- View real-time output / 查看实时输出
- Send command input / 发送命令输入
- Use quick buttons (Yes/No/Enter/Ctrl+C) / 使用快捷按钮（Yes/No/Enter/Ctrl+C）

## 🏗️ Architecture / 架构

```
┌─────────────┐     WebSocket     ┌─────────────┐
│  Mobile     │ ←──────────────→  │   Node.js   │
│  Browser    │                    │   Server    │
└─────────────┘                    └──────┬──────┘
                                          │
                                          ↓ tmux commands
                                    ┌──────────┐
                                    │  tmux    │
                                    │ sessions │
                                    └──────────┘
```

### Tech Stack / 技术栈

- **Backend:** Node.js + Express + ws (WebSocket) / **后端：** Node.js + Express + ws (WebSocket)
- **Frontend:** Pure HTML/CSS/JavaScript (no frameworks) / **前端：** 纯 HTML/CSS/JavaScript（无框架）
- **Integration:** tmux command-line tool / **集成：** tmux 命令行工具

### Directory Structure / 目录结构

```
mobileCC/
├── src/
│   ├── server.js       # Express + WebSocket server / Express + WebSocket 服务器
│   ├── tmux.js         # tmux command wrapper / tmux 命令封装
│   ├── tail.js         # Log tracking + ANSI cleaning / 日志追踪 + ANSI 清理
│   └── util.js         # Utility functions / 工具函数
├── public/
│   ├── index.html      # Session list page / Session 列表页
│   ├── session.html    # Session connection page / Session 连接页
│   ├── app.js          # List page logic / 列表页逻辑
│   ├── session.js      # Connection page logic / 连接页逻辑
│   └── style.css       # Styles (dark theme) / 样式（深色主题）
├── data/logs/          # tmux output log directory / tmux 输出日志目录
└── package.json
```

## 🔧 Deployment / 部署

### Local Development / 本地开发

```bash
npm install
npm start
```

### Production Environment / 生产环境

#### Using PM2 (Recommended) / 使用 PM2（推荐）

```bash
npm install -g pm2
pm2 start src/server.js --name mobilecc
pm2 save
pm2 startup
```

#### Using systemd / 使用 systemd

Create `/etc/systemd/system/mobilecc.service`:

```ini
[Unit]
Description=MobileCC - tmux Remote Control
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/mobileCC
ExecStart=/usr/bin/node src/server.js
Restart=always
Environment=PORT=5002

[Install]
WantedBy=multi-user.target
```

Start the service / 启动服务：

```bash
sudo systemctl enable mobilecc
sudo systemctl start mobilecc
```

### Reverse Proxy / 反向代理

#### Using Cloudflare Tunnel (Recommended) / 使用 Cloudflare Tunnel（推荐）

```bash
cloudflared tunnel --url http://localhost:5002
```

#### Using nginx / 使用 nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Log Management / 日志管理

Configure `logrotate` to manage the `data/logs/` directory:

```bash
# /etc/logrotate.d/mobilecc
/path/to/mobileCC/data/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

## 🐛 Troubleshooting / 故障排查

### Port Already in Use / 端口被占用

```bash
# Find the process using the port / 查找占用端口的进程
lsof -i :5002

# Kill the process / 杀掉进程
kill <PID>

# Or use a different port / 或使用其他端口
PORT=3000 npm start
```

### Cannot See tmux Sessions / 无法看到 tmux sessions

- Ensure tmux server is running: `tmux list-sessions` / 确保 tmux server 正在运行：`tmux list-sessions`
- Check log file permissions: `ls -la data/logs/` / 检查日志文件权限：`ls -la data/logs/`
- Check server logs: Look at console output / 查看服务器日志：检查控制台输出

### Abnormal Output Display / 输出显示异常

- If you see many control characters, refresh the page / 如果看到大量控制字符，刷新页面
- Clear browser cache / 清除浏览器缓存
- Check if it's old version code, restart server / 检查是否是旧版本代码，重启服务器

## 🔐 Security Recommendations / 安全建议

**⚠️ Important:** MobileCC **does NOT include any authentication or permission management system**. Before deploying to a public network or accessible network, **you MUST** configure one of the following security solutions:

**⚠️ 重要提示：** MobileCC **不内置任何认证或权限管理系统**。在部署到公网或可访问的网络前，**必须**配置以下安全方案之一：

### Recommended Solutions (Personal Use) / 推荐方案（个人使用）

**1. Cloudflare Zero Trust (Strongly Recommended) / Cloudflare Zero Trust（强烈推荐）**

- Use [Cloudflare Zero Trust](https://www.cloudflare.com/products/zero-trust/) to protect your app / 使用 [Cloudflare Zero Trust](https://www.cloudflare.com/products/zero-trust/) 保护应用
- Configure One-Time PIN, Google OAuth, or other authentication methods / 配置 One-Time PIN、Google OAuth 或其他身份验证方式
- Expose services securely via Cloudflare Tunnel without opening server ports / 通过 Cloudflare Tunnel 安全暴露服务，无需开放服务器端口

**2. Internal Network + VPN / 内网 + VPN**

- Deploy within LAN only / 仅在局域网内部署
- Access remotely via VPN (e.g., WireGuard, Tailscale) / 配合 VPN（如 WireGuard、Tailscale）远程访问

**3. Reverse Proxy + Basic Auth / 反向代理 + 基础认证**

- Use nginx with HTTP Basic Authentication / 使用 nginx 配置 HTTP Basic Authentication
- Only suitable for trusted network environments / 仅适用于可信网络环境

### Never Do This / 绝对不要做的

- ❌ **Do NOT expose the service directly to the public internet** (e.g., `0.0.0.0:5002`) / ❌ **不要直接将服务暴露到公网**（如 `0.0.0.0:5002`）
- ❌ **Do NOT access via public IP without authentication** / ❌ **不要在无认证的情况下通过公网 IP 访问**
- ❌ **Do NOT use on shared servers** / ❌ **不要在共享服务器上使用**

### Other Security Practices / 其他安全实践

- Regularly clean log files in `data/logs/` directory (may contain sensitive information) / 定期清理 `data/logs/` 目录中的日志文件（可能包含敏感信息）
- Use HTTPS (configure SSL via Cloudflare or nginx) / 使用 HTTPS（通过 Cloudflare 或 nginx 配置 SSL）
- Restrict log file access permissions / 限制日志文件的访问权限

## 🤝 Contributing / 贡献

Issues and Pull Requests are welcome!

欢迎提交 Issue 和 Pull Request！

## 📄 License / 许可证

MIT License - See [LICENSE](LICENSE) file for details.

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 Acknowledgments / 致谢

- **[Happy Coder](https://github.com/slopus/happy)** - An excellent mobile client for Claude Code/Codex. This project borrows its "mobile remote control" design concept / **[Happy Coder](https://github.com/slopus/happy)** - 一个优秀的 Claude Code/Codex 移动端客户端，本项目借鉴了其"移动端远程控制"的设计理念
- tmux - Powerful terminal multiplexer / tmux - 强大的终端复用器
- Express - Node.js web framework / Express - Node.js Web 框架
- ws - WebSocket library / ws - WebSocket 库
- Cloudflare - Zero Trust and Tunnel services for securely exposing personal tools to the public internet / Cloudflare - Zero Trust 和 Tunnel 服务，让个人工具安全地暴露到公网

## 📮 Contact / 联系方式

- GitHub: [@lucyfer81](https://github.com/lucyfer81)

---

⭐ If this project helps you, please give it a Star!

⭐ 如果这个项目对你有帮助，请给个 Star！
