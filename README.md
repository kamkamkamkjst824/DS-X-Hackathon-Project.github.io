# BU 校园账户

Vue 3 + Vite，简约英文登录与注册页面，手写 CSS，无 UI 组件库。后端位于 `C:\Users\tangy\Desktop\Cloudflare_Part`。

## 本地运行

需要 Node.js 22.12+。先按后端 README 初始化本地 D1 并启动 Worker，再在此前端文件夹运行：

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

打开 `http://127.0.0.1:5173`。默认 API 为 `http://127.0.0.1:8787`。要使用其他 API，在 `.env.local` 配置 `VITE_API_BASE_URL` 为后端来源，无 `/api/auth` 后缀，修改后重启 Vite。

## 使用

- 切换登录或注册；注册只需 `@bu.edu` 邮箱和 8–128 个字符的密码。
- 注册后自动登录，显示当前邮箱和退出按钮。
- 登录令牌与到期时间保存在 localStorage，不保存密码；刷新、关闭再打开浏览器后调用 `/me` 恢复登录。
- 会话固定 7 天。401 会清除本机登录；网络故障保留会话并提供重新连接按钮。
- 退出先撤销服务端会话，再清除本机数据；网络故障时显示错误，允许重试。

不包含邮箱验证、密码重置或个人资料功能。

## 构建与发布配置

```powershell
npm run build
npm run preview -- --host 127.0.0.1
```

发布前设置实际 Worker 来源为 `VITE_API_BASE_URL`，然后重新构建。后端 `ALLOWED_ORIGINS` 必须包含实际前端来源。前后端线上均使用 HTTPS。

当前后端已部署到 `https://bu-auth-worker.tangyingkai120.workers.dev`。`.env.production` 已纳入版本管理，只包含公开的 API 地址，生产构建默认连接线上数据库。本机 `.env.local` 也已配置线上地址并被 Git 忽略；需要切回本地后端时，将 `.env.local` 中的地址改为 `http://127.0.0.1:8787`。其他开发环境可复制 `.env.example` 配置本地 API。

发布到 GitHub Pages 仓库子路径时，使用 `npm run build -- --base=/DS-X-Hackathon-Project.github.io/`；如部署到站点根路径，使用普通构建即可。页面不依赖客户端路由。

界面验证：桌面和手机宽度、Tab 键聚焦、回车提交、提交时按钮禁用、重复邮箱、错误密码、断网恢复、刷新恢复及退出后重新登录。接口自动测试与 Worker 部署预检见后端 README。
