# 《夜幕审判》GitHub Pages + Render 部署指南

## 部署结构

- GitHub Pages：托管 React/Vite 前端。
- Render Web Service：运行 `server/index.mjs`，维护 WebSocket 房间、成员、准备状态和 AI 补位。
- DeepSeek：当前仍由玩家浏览器使用自己填写的 API Key 请求。公开运营时建议改为服务端代理并增加限流。

## 一、本地联调

安装依赖：

```bash
npm ci
```

复制环境变量：

```bash
cp .env.example .env.local
```

终端一启动房间服务：

```bash
npm run server
```

终端二启动前端：

```bash
npm run dev
```

默认前端连接同源 `/ws`，Vite 会把它代理到 `ws://localhost:3001`；健康检查地址为 `http://localhost:3001/health`。如需直连其他开发服务，可在 `.env.local` 中设置 `VITE_ROOM_SERVER_URL`。

## 二、推送到 GitHub

1. 在 GitHub 创建新仓库，例如 `night-judgment`。
2. 将整个项目推送到仓库的 `main` 分支。
3. 仓库必须包含 `.github/workflows/deploy-pages.yml`。
4. 在仓库打开 `Settings → Pages`。
5. 将 `Build and deployment → Source` 设置为 `GitHub Actions`。

暂时不要运行最终部署，先完成 Render 服务并取得 WebSocket 地址。

## 三、部署 Render 房间服务

### Blueprint 方式

1. 登录 Render，选择 `New → Blueprint`。
2. 连接刚才的 GitHub 仓库。
3. Render 会读取项目根目录的 `render.yaml`。
4. 创建 `night-judgment-room-server` 服务。
5. 在服务环境变量中设置：

```text
FRONTEND_ORIGIN=https://你的GitHub用户名.github.io
```

6. 等待部署完成，访问：

```text
https://你的Render服务名.onrender.com/health
```

返回 `{"ok":true,...}` 表示服务正常。

WebSocket 地址应写成：

```text
wss://你的Render服务名.onrender.com/ws
```

生产环境必须使用 `wss://`，因为 GitHub Pages 是 HTTPS 页面，浏览器会阻止不安全的 `ws://`。

### 手动创建方式

如果不使用 Blueprint：

- Runtime：`Node`
- Build Command：`npm ci`
- Start Command：`npm run server`
- Health Check Path：`/health`
- Node Version：`22`

## 四、配置 GitHub Pages

1. 打开 GitHub 仓库的 `Settings → Secrets and variables → Actions → Variables`。
2. 创建仓库变量：

```text
名称：VITE_ROOM_SERVER_URL
值：wss://你的Render服务名.onrender.com/ws
```

3. 进入 `Actions`，手动运行 `Deploy GitHub Pages`，或向 `main` 分支再推送一次提交。
4. 部署完成后打开：

```text
https://你的GitHub用户名.github.io/仓库名/
```

工作流会自动把 `VITE_BASE_PATH` 设置为仓库路径，因此图片、JavaScript 和 CSS 能在 GitHub Pages 子路径下正确加载。

## 五、验证联机

1. 在浏览器 A 打开 GitHub Pages，点击“创建联机房间”。
2. 复制邀请链接。
3. 在浏览器 B 或无痕窗口打开该链接。
4. 确认两个窗口显示相同房间号和成员列表。
5. 两名真人分别点击“准备”。
6. 房主点击“空位全部补充人机”。
7. 所有席位准备后，房主点击“全员准备，开始游戏”。

## 免费实例注意事项

- Render 免费服务长时间无人访问后可能休眠，第一次连接可能需要等待几十秒。
- 当前房间保存在 Render 进程内存中。服务重启后房间会消失。
- 若要长期运营或水平扩容，应把房间状态迁移到 Redis，并增加断线重连令牌。
- 不要把 DeepSeek API Key 写入 GitHub 仓库、`.env` 文件或 Render 日志。

## 当前联机边界

当前版本完成了共享房间、链接加入、真人准备、AI 补位、统一开始信号和 WebSocket 游戏事件通道。身份牌会使用同一随机种子生成，加入者获得自己的席位身份。复杂对局中的服务端权威行动校验、断线续局和观战仍建议在正式公开运营前继续升级。
