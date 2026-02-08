# MobileCC

> 📱 tmux 移动端远程控制工具 - 在手机上轻松管理和操作你的 tmux sessions

MobileCC 是一个基于 Node.js 的 Web 应用，允许你通过手机浏览器远程控制服务器上的 tmux sessions。特别适合在移动设备上监控长时间运行的命令行任务，如 Claude Code 开发会话。

## ✨ 特性

- 🎯 **实时输出查看** - WebSocket 实时推送 tmux session 输出
- 📝 **命令输入** - 在手机上发送命令到 tmux session
- 🎨 **ANSI 清理** - 自动清理 ANSI 控制码，手机阅读更清爽
- 🔔 **输入活动提示** - 多端输入时显示友好的提示信息
- 🔄 **断线重连** - 自动加载历史日志，无缝恢复会话
- 🌙 **深色主题** - 护眼的深色界面，移动端优化
- 🚀 **轻量级** - 纯 HTML/CSS/JS 前端，无框架依赖

## 📸 截图

（项目截图待添加）

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- tmux
- npm 或 yarn

### 安装

```bash
# 克隆仓库
git clone https://github.com/lucyfer81/mobileCC.git
cd mobileCC

# 安装依赖
npm install
```

### 启动

```bash
npm start
```

服务器默认运行在 http://127.0.0.1:5002

### 配置环境变量（可选）

```bash
# 自定义端口
PORT=3000 npm start

# 自定义日志目录
LOG_DIR=/var/log/mobilecc npm start
```

## 📖 使用方法

### 1. 在服务器上创建 tmux session

```bash
tmux new -s mysession
```

### 2. 在 tmux session 中运行你的命令

```bash
cd /path/to/your/project
claude code
# 或任何长时间运行的命令
```

### 3. 在手机浏览器访问列表页

打开手机浏览器，访问：
- 本地：http://your-server-ip:5002
- 或通过 Cloudflare Tunnel / nginx 反向代理的域名

### 4. 选择或输入 session 名称连接

- 从列表中选择现有的 tmux session
- 或手动输入 session 名称（例如 `mysession`）

### 5. 开始远程操作

- 查看实时输出
- 发送命令输入
- 使用快捷按钮（Yes/No/Enter/Ctrl+C）

## 🏗️ 架构

```
┌─────────────┐     WebSocket     ┌─────────────┐
│  手机浏览器  │ ←──────────────→  │ Node.js     │
│             │                    │ 服务器      │
└─────────────┘                    └──────┬──────┘
                                          │
                                          ↓ tmux 命令
                                    ┌──────────┐
                                    │ tmux     │
                                    │ sessions │
                                    └──────────┘
```

### 技术栈

- **后端：** Node.js + Express + ws (WebSocket)
- **前端：** 纯 HTML/CSS/JavaScript（无框架）
- **集成：** tmux 命令行工具

### 目录结构

```
mobileCC/
├── src/
│   ├── server.js       # Express + WebSocket 服务器
│   ├── tmux.js         # tmux 命令封装
│   ├── tail.js         # 日志追踪 + ANSI 清理
│   └── util.js         # 工具函数
├── public/
│   ├── index.html      # Session 列表页
│   ├── session.html    # Session 连接页
│   ├── app.js          # 列表页逻辑
│   ├── session.js      # 连接页逻辑
│   └── style.css       # 样式（深色主题）
├── data/logs/          # tmux 输出日志目录
└── package.json
```

## 🔧 部署

### 本地开发

```bash
npm install
npm start
```

### 生产环境

#### 使用 PM2（推荐）

```bash
npm install -g pm2
pm2 start src/server.js --name mobilecc
pm2 save
pm2 startup
```

#### 使用 systemd

创建 `/etc/systemd/system/mobilecc.service`：

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

启动服务：

```bash
sudo systemctl enable mobilecc
sudo systemctl start mobilecc
```

### 反向代理

#### 使用 Cloudflare Tunnel（推荐）

```bash
cloudflared tunnel --url http://localhost:5002
```

#### 使用 nginx

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

### 日志管理

配置 `logrotate` 管理 `data/logs/` 目录：

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

## 🐛 故障排查

### 端口被占用

```bash
# 查找占用端口的进程
lsof -i :5002

# 杀掉进程
kill <PID>

# 或使用其他端口
PORT=3000 npm start
```

### 无法看到 tmux sessions

- 确保 tmux server 正在运行：`tmux list-sessions`
- 检查日志文件权限：`ls -la data/logs/`
- 查看服务器日志：检查控制台输出

### 输出显示异常

- 如果看到大量控制字符，刷新页面
- 清除浏览器缓存
- 检查是否是旧版本代码，重启服务器

## 🔐 安全建议

- **不要暴露到公网**（除非使用 HTTPS + 认证）
- **使用 Cloudflare Access** 或类似服务保护访问
- **限制 API 访问**（如果需要，可以添加认证中间件）
- **定期清理日志**（避免敏感信息泄露）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- tmux - 强大的终端复用器
- Express - Node.js Web 框架
- ws - WebSocket 库

## 📮 联系方式

- GitHub: [@lucyfer81](https://github.com/lucyfer81)

---

⭐ 如果这个项目对你有帮助，请给个 Star！
