# 如何把《夜幕审判》项目上传到 GitHub

这篇文档只讲一件事：**把本地项目源码上传到你自己的 GitHub 仓库**。  
上传完成后，再继续看 [DEPLOYMENT.md](file:///workspace/night-judgment/DEPLOYMENT.md) 做 GitHub Pages 前端部署和 Render 房间服务部署。

---

## 一、准备工作

### 1. 注册 GitHub
- 去 [github.com](https://github.com/) 注册账号。
- 记住你的 GitHub 用户名，比如 `your-name`。

### 2. 安装 Git
- **Windows**：安装 [Git for Windows](https://git-scm.com/download/win)，安装时一路默认即可，之后可用 `Git Bash` 或 PowerShell 执行命令。
- **macOS**：在终端执行 `xcode-select --install`，或直接从 [git-scm](https://git-scm.com/download/mac) 安装。
- **Linux (Ubuntu / Debian)**：执行 `sudo apt update && sudo apt install git -y`。

安装完成后打开终端，检查是否成功：

```bash
git --version
```

有版本号输出就表示安装好了。

### 3. 设置 Git 用户名与邮箱
第一次使用 Git 需要做全局配置，**只执行一次**。注意这里的名字和邮箱只是提交记录显示用，不强制与 GitHub 完全一致：

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

如果你希望提交记录和 GitHub 账号强绑定，建议邮箱填 GitHub 的公开邮箱或 [Keep my email addresses private](https://docs.github.com/cn/account-and-profile/setting-up-and-managing-your-personal-account/managing-email-preferences/setting-your-commit-email-address) 里的 `noreply` 邮箱。

---

## 二、上传前的安全检查（非常重要）

1. **不要提交真实密钥**
   - DeepSeek API Key、Render 密钥、任何生产环境密钥，都不要写进仓库。
   - `.env.local`、`.env.production` 这类本地环境文件不要提交。
   - 项目里已经有 [.gitignore](file:///workspace/night-judgment/.gitignore)，通常会忽略 `node_modules`、`dist` 和部分环境文件，但你仍要自己核对。

2. **推荐做法**
   - 只把 [.env.example](file:///workspace/night-judgment/.env.example) 作为模板提交，里面留占位符，不要填真的值。
   - 真实密钥只放在本地或 Render / GitHub Actions 的 Secrets / Variables 里。

---

## 三、在 GitHub 上创建一个空仓库

1. 打开 GitHub 并登录。
2. 右上角加号 → `New repository`。
3. 填写仓库名，例如：`night-judgment`。
4. 选择：
   - `Public` 或 `Private` 都可以。
   - **不要勾选**：
     - Add a README file
     - Add .gitignore
     - Choose a license
   > 这里一定要创建“空仓库”。如果自动生成了 README，等一下推送会冲突。

5. 点 `Create repository`。

创建后你会看到 GitHub 给你两条操作方式：HTTPS 或 SSH。  
下面的步骤默认用 **HTTPS**，更适合新手。

---

## 四、把本地项目变成 Git 仓库并提交

打开终端，进入项目目录：

```bash
cd night-judgment
```

如果你是在 `night-judgment` 文件夹里已经有全部文件，就执行下面这些命令。**一行一行执行，不要一次全粘回车**。

```bash
git init
git checkout -b main
git add .
git commit -m "feat: init project with multiplayer lobby"
```

解释：
- `git init`：在当前目录初始化一个本地 Git 仓库。
- `git checkout -b main`：把默认分支命名为 `main`（符合 GitHub 新习惯）。
- `git add .`：把当前目录下所有“没被 .gitignore 忽略”的文件加入暂存区。
- `git commit -m "..."`：生成一次提交记录。

如果 `git checkout -b main` 报错“已经是 main 分支”，跳过即可。

---

## 五、把本地仓库连接到 GitHub 并推送

把下面命令里的两处 `your-name` 和仓库名改成你自己的：

```bash
git remote add origin https://github.com/your-name/night-judgment.git
git push -u origin main
```

执行后：
- 如果你用 HTTPS，一般会让你输入用户名和密码。
  - 现在 GitHub 不支持直接用账号密码登录 Git HTTPS，通常会：
    - 弹出浏览器授权窗口（Git Credential Manager）。
    - 或要求你用 **Personal Access Token** 当密码。

### 什么是 Personal Access Token
如果你被要求输入密码但又用不了账号密码：

1. 打开 [GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)。
2. 生成一个新 token，权限勾选 `repo` 即可。
3. 复制 token。
4. 当终端提示“Password”时，**把 token 粘贴进去**（输入时不显示字符），回车。

成功后你会看到类似：

```text
Enumerating objects: ...
* [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

这时刷新 GitHub 仓库页面，就能看到文件了。

---

## 六、如果你想走 SSH（可选，老手可看）

SSH 的好处是以后不再每次输 token。步骤：

1. 生成密钥：

```bash
ssh-keygen -t ed25519 -C "you@example.com"
```

一路回车即可，默认保存在 `~/.ssh/id_ed25519`。

2. 启动 ssh-agent 并添加密钥：

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

3. 把 `~/.ssh/id_ed25519.pub` 的**全部内容**复制到 GitHub：  
   `Settings → SSH and GPG keys → New SSH key`

4. 测试是否连上：

```bash
ssh -T git@github.com
```

5. 修改远程地址为 SSH：

```bash
git remote set-url origin git@github.com:your-name/night-judgment.git
```

6. 之后推送就用：

```bash
git push
```

---

## 七、后续本地改完代码，如何再次上传

以后你每次改完文件，只需三件事：**add → commit → push**。

```bash
git add .
git commit -m "fix: 修正某个 bug 或新增某个功能"
git push
```

刷新 GitHub 仓库页面，就会看到新的提交记录。

---

## 八、常见问题

### 1. `error: remote origin already exists.`
说明你之前已经加过 origin 了。可以先删掉旧的：

```bash
git remote remove origin
```

然后重新执行：

```bash
git remote add origin https://github.com/your-name/night-judgment.git
git push -u origin main
```

或直接修改地址：

```bash
git remote set-url origin https://github.com/your-name/night-judgment.git
git push -u origin main
```

### 2. push 时提示“Updates were rejected because the remote contains work that you do not have locally.”
通常是因为你在 GitHub 网页上手动加了 README 或 LICENSE，和本地历史冲突。  
新手最简单的办法：**删掉 GitHub 仓库重来**，创建时什么都不要勾。

如果你不想删仓库，可执行：

```bash
git pull --rebase origin main
git push origin main
```

但这一步可能会有冲突，需要你手动解决。第一次上传强烈建议从“空仓库”开始。

### 3. Windows 下 Git 每次 commit 都报一大堆 LF / CRLF 警告
可以配置：

```bash
git config --global core.autocrlf true
```

这样 Windows 本地会自动转换换行符，不影响 GitHub。

### 4. 我 push 成功了，但是文件在 GitHub 上没刷新/没全显示
- 刷新页面。
- 检查是不是分支不对：GitHub 网页顶部看看是不是 `main` 分支。
- 检查命令是不是 `git push -u origin main`，而不是推到 `master`。

---

## 九、上传完成后，接下来做什么

项目已经成功传到 GitHub 仓库之后，回到 [DEPLOYMENT.md](file:///workspace/night-judgment/DEPLOYMENT.md) 继续：

1. 部署 Render 房间服务（WebSocket 联机房间）。
2. 配置 GitHub Pages 仓库变量 `VITE_ROOM_SERVER_URL`。
3. 打开 GitHub Pages 的 Actions 部署。
4. 双浏览器联机验收。

如果你只想把代码放 GitHub 给别人看，不想上线联机，那完成本指南的“五、把本地仓库连接到 GitHub 并推送”就够了。
