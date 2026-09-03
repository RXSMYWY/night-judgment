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
- Build Command：`npm install -g npm@latest && npm install --registry https://registry.npmjs.org/`
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
8. 两端分别查看身份并点击“进入村庄”；最后一名真人进入后，夜间 10 秒倒计时开始。
9. 确认两个页面显示相同轮次、夜间步骤、死亡结果、发言顺序和投票结果。
10. 若其中一名玩家是狼人，确认其能看到狼队友与狼队私聊，而好人页面完全看不到私聊。
11. 轮到真人发言时，确认两端显示同一个 60 秒倒计时；不发言时应在超时后自动过麦。
12. 刷新任意一端，确认该页面仍恢复到原席位、原身份和同一局游戏。

## 免费实例注意事项

- Render 免费服务长时间无人访问后可能休眠，第一次连接可能需要等待几十秒。
- 当前房间保存在 Render 进程内存中。服务重启后房间会消失。
- 若要长期运营或水平扩容，应把房间状态迁移到 Redis，并增加断线重连令牌。
- 不要把 DeepSeek API Key 写入 GitHub 仓库、`.env` 文件或 Render 日志。

## 当前联机边界

当前版本由 Render 服务端统一保存身份、夜间行动、发言、投票和胜负状态，并向每名真人发送经过私密信息过滤的个人视图。夜间子阶段采用服务端 10 秒计时，真人发言采用服务端 60 秒计时，狼人队友与私聊只对狼人可见。当前标签页可凭会话令牌在刷新后恢复原席位。房间仍为单实例内存状态，Render 重启会清空房间；跨实例会话、观战和 Redis 持久化仍建议在正式运营前补充。

更新到这一版本后，必须同时重新部署 Render 和 GitHub Pages：仅更新前端或仅更新服务端都会造成 WebSocket 协议版本不一致。
