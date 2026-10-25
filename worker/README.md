# BU 账户 API

Cloudflare Workers + D1，原生 JavaScript。只允许 `@bu.edu` 邮箱，密码为 8–128 个字符（按 JavaScript 字符串长度计算），不裁剪密码空格。邮箱统一去除首尾空格并转为小写。

## 本地启动

需要 Node.js 22.12+ 和 npm。在本文件夹运行：

```powershell
npm ci
npm run db:migrate
npm run dev
```

API 地址为 `http://127.0.0.1:8787`。本地数据库保存在 `.wrangler/`，重启仍保留；测试使用独立临时数据库，不影响开发数据。默认允许 `http://localhost:5173` 和 `http://127.0.0.1:5173`。

如需修改本地来源，可复制 `.dev.vars.example` 为 `.dev.vars` 并修改 `ALLOWED_ORIGINS`，使用逗号分隔完整来源（协议、主机、端口，无路径或末尾斜杠）。

## 接口

请求和响应均为 JSON。注册与登录请求体为 `{ "email": "name@bu.edu", "password": "your password" }`。

| 方法与路径 | 成功响应 |
| --- | --- |
| `POST /api/auth/register` | 201，`{ user: { id, email }, token, expiresAt }` |
| `POST /api/auth/login` | 200，同上 |
| `GET /api/auth/me` | 200，`{ user: { id, email } }` |
| `POST /api/auth/logout` | 200，`{ success: true }` |

后两项需传 `Authorization: Bearer <token>`。`expiresAt` 是 Unix 毫秒时间戳，从注册/登录起固定 7 天，不因访问延长。允许多设备会话，退出只撤销当前令牌。错误统一为 `{ error: "English message" }`，方便英文界面直接显示：400 输入错误，401 认证失败，403 来源禁止，404 路径不存在，405 方法错误，409 邮箱重复，500 服务故障。认证响应禁止缓存。

密码采用 PBKDF2-SHA-256、100,000 次迭代、16 字节随机盐；登录令牌使用 32 字节随机数，数据库仅保存 SHA-256 摘要。所有数据库输入使用参数化查询。注册的用户和首个会话通过事务批次一起创建。登录时清理过期会话。

本期只检查邮箱格式，不发送邮件验证归属；不包含密码重置或防暴力破解限流。浏览器按需求用 localStorage 保存令牌，因此不要引入不可信脚本；线上前后端均应使用 HTTPS。

## 检查

```powershell
npm test
npm run check
```

集成测试直接运行 Workers 的 workerd 环境与 D1，验证密码派生、注册并发、输入校验、会话、退出和 CORS。`check` 只打包预检，不发布。

## 部署准备

1. 运行 `npx wrangler login` 登录自己的 Cloudflare 账户。
2. 运行 `npx wrangler d1 create bu-auth` 创建数据库。
3. 将返回的实际 `database_id` 添加到 `wrangler.jsonc` 的 D1 配置中。仓库未填写虚构的数据库 ID。
4. 在 `wrangler.jsonc` 中将 `ALLOWED_ORIGINS` 改为实际前端来源。GitHub Pages 的来源是 `https://用户名.github.io`，不包含仓库路径。
5. 运行 `npm run db:migrate:remote`，再运行 `npm run deploy`。
6. 将部署返回的实际 Worker 来源填到前端 `VITE_API_BASE_URL`，重新构建前端。

远程迁移和 deploy 会修改线上资源，应在决定上线时执行。

## 当前线上部署

- Worker：`https://bu-auth-worker.tangyingkai120.workers.dev`
- D1：`bu-auth`，数据库 ID 已写入 `wrangler.jsonc`，建表迁移已应用。
- 允许来源：本地 5173 端口，以及 `https://kamkamkamkjst824.github.io`。
- 本地测试账户未迁移到线上；线上注册会写入独立的线上数据库。

## Using the Database (D1)

The Worker stores its data in Cloudflare D1 (SQLite). It is bound as `DB` in `wrangler.jsonc` (database name `bu-auth`). The Worker writes to it automatically when users register, log in, or save preferences, so the frontend never touches the database directly.

### Tables

| Table | Purpose | Migration |
| --- | --- | --- |
| `users` | Accounts: email, PBKDF2 password hash and salt | `0001_auth.sql` |
| `sessions` | SHA-256 hashes of login tokens with expiry | `0001_auth.sql` |
| `preferences` | Per-user diet flags (vegetarian, vegan, gluten_free, halal), `max_calories`, `min_protein`, `likes` | `0002_dining.sql` |
| `rate_limits` | Per-user request counters for `/api/recommend` | `0002_dining.sql` |
| `location_preferences` | Included dining halls and their preference order | `0003_locations.sql` |
| `nutrition_preferences` | Per-user nutrition goals and whether they are daily or per-serving | `0004_nutrition.sql`, `0006_nutrition_scope.sql` |
| `recommendation_settings` | Default or Advanced Mode and custom factor weights | `0005_recommendation_settings.sql` |

Dining menus are not stored in D1. They are cached for 10 minutes with the Workers Cache API (`src/dining.js`).

`GET/PUT /api/recommendation-settings` stores a user's recommendation mode, priority order, and custom weights. `POST /api/recommend` applies dietary and location filters, calculates weighted scores, then asks Workers AI to select up to five dishes from the highest-scoring candidates. If AI is unavailable, the Worker returns the highest-scoring dishes directly.

### Authenticated menu proxy

`GET /api/v1/dining/locations/{location}/menu?day=YYYY-MM-DD` returns the BU menu for `warren`, `west`, or `marciano`. Send the account session as `Authorization: Bearer <token>`. Dates must be today through six days ahead in America/New_York. The endpoint allows 30 requests per minute per user.

The Worker adds its `BU_API_KEY` secret and User-Agent upstream. Set the deployed secret with `npx wrangler secret put BU_API_KEY`; local Worker development uses `.dev.vars`. Frontend `.env.local` needs only the public `VITE_API_BASE_URL`, never the BU key. Upstream credential failures return 502, while expired user sessions return 401.

### Local vs. remote

- Local: `npm run db:migrate` creates the tables in `.wrangler/`. `npm run dev` uses this database. The data stays there between restarts and is separate from production.
- Remote: `npm run db:migrate:remote` applies migrations to the production database. This changes live data, so run it only when you are ready to deploy.

### Querying data

Run these commands from this folder. Replace `--local` with `--remote` to query production.

```powershell
npx wrangler d1 execute DB --local --command "SELECT id, email, created_at FROM users"
npx wrangler d1 execute DB --local --command "SELECT * FROM preferences"
npx wrangler d1 execute DB --local --file ./query.sql
```

You can also browse tables and run SQL in the Cloudflare dashboard: Storage & Databases → D1 → `bu-auth`.

### Adding new data

The example below adds dish ratings.

1. Create a migration. Never edit a migration that has already been applied; add a new numbered file instead.

   ```sql
   -- migrations/0003_ratings.sql
   CREATE TABLE ratings (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     item_id TEXT NOT NULL,
     location TEXT NOT NULL,
     score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
     created_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, item_id)
   );
   ```

2. Add a handler in `src/index.js` and register it in `ROUTES`. Always use `prepare(...).bind(...)` (parameterized queries) and never build SQL strings from user input.

   ```js
   async function postRating(request, env, { user }) {
     const { itemId, location, score } = await readJson(request)
     if (typeof itemId !== 'string' || typeof location !== 'string' || !Number.isInteger(score) || score < 1 || score > 5) {
       throw new HttpError(400, 'Invalid rating.')
     }
     await env.DB.prepare(`INSERT INTO ratings (user_id, item_id, location, score, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, item_id) DO UPDATE SET score = excluded.score, created_at = excluded.created_at`)
       .bind(user.id, itemId, location, score, Date.now()).run()
     return json({ success: true })
   }

   // in ROUTES:
   '/api/ratings': { POST: authed(postRating) },
   ```

   Common D1 calls: `.first()` returns one row or `null`, `.all()` returns `{ results: [...] }`, `.run()` executes a write, and `db.batch([...])` runs several statements atomically.

3. Call the endpoint from the frontend with the existing helper:

   ```js
   import { request } from './api.js'
   await request('/api/ratings', { method: 'POST', token, body: { itemId, location: 'marciano', score: 5 } })
   ```

4. Apply the migration and test it locally with `npm run db:migrate` and `npm test`. When you are ready to ship, run `npm run db:migrate:remote` and then `npm run deploy`.

### Resetting the local database

Stop `npm run dev`, delete the `.wrangler/state` folder, and run `npm run db:migrate` again. This only affects local data.
