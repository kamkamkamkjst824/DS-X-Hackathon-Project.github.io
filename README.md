# BU Campus Account

A minimal English sign-in and registration interface built with Vue 3, Vite, and custom CSS. No UI component library is required. The Cloudflare Workers backend is maintained separately in the `Cloudflare_Part` folder.

## Local Development

Requires Node.js 22.12 or later. Development connects to the deployed Cloudflare account API and the BU Dining API. Copy `.env.example` to `.env.local`, then run these commands in the frontend project folder:

```powershell
cp .env.example .env.local
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The development server uses port 5173 and reports an error if that port is occupied instead of silently switching to a port the API does not allow.

Dining menu requests go to the Cloudflare Worker configured by `VITE_API_BASE_URL`, with the signed-in session token. The Worker validates requests and adds its `BU_API_KEY` secret when contacting BU. No BU key belongs in the frontend environment or browser bundle. For a local Worker, configure the key in `Cloudflare_Part/.dev.vars`; for production, use `wrangler secret put BU_API_KEY`.

To use another backend, copy `.env.example` to `.env.local`, set `VITE_API_BASE_URL` to its origin without the `/api/auth` suffix, and restart Vite. For a local Worker, use `http://127.0.0.1:8787` and follow the backend README to initialize local D1 and start the Worker.

If an existing `.env.local` points to `127.0.0.1:8787` while you intend to use the deployed backend, update it to `https://bu-auth-worker.tangyingkai120.workers.dev` and restart Vite. Local environment overrides still take precedence.

## Account Features

- Switch between sign-in and registration. Registration requires an `@bu.edu` email address and a password of 8–128 characters.
- Registration signs the user in automatically and displays their email address and a sign-out button.
- The session token and expiration time are stored in localStorage. Passwords are never stored in the browser. On reload or browser restart, the app calls `/api/auth/me` to restore the session.
- Sessions last for a fixed seven days. A 401 response during session restoration clears the local session. Network failures preserve it and offer a retry button.
- Sign-out revokes the server session before clearing local data. Network failures display an error and allow another attempt.

Email ownership verification, password resets, and profile management are outside the current feature set.

## Dining recommendations

After signing in, users can set required dietary needs, enter food keywords they like, add optional nutrition goals, and rank the dining locations they want included from 1 to 3. Choosing "Don't want" excludes a location from both menu requests and recommendations. Users can also choose the relative priority of food keywords, location, and nutrition goals. Dietary needs always remain strict filters before those ranking priorities are applied.

When ranking by nutrition, dishes with more selected nutrition goals within ±25% rank higher, followed by closeness to those goals. Food-name keyword matches and saved location ranks are compared according to the user's selected priority order. Missing food keywords are reported without penalizing remaining dishes.

Menus and item nutrition/dietary labels come from the BU Dining API's `/api/v1/dining/locations/{location}/menu` endpoint. Nutrition goals not explicitly added are ignored. If a selected nutrition field is missing from the menu data, that dish cannot match that goal.

For local testing, start the Python location-preference server in one terminal:

```sh
python3 preference_server.py
```

Then start Vite in another terminal with `npm run dev` and open `http://localhost:5173`. Vite proxies `/api/preferences` to the Python server on port 8000.

The Python prototype writes location preferences to one shared local `user.py`, replacing the previous ranking on each save. It is not per-account storage, does not support concurrent users, and is not available on static GitHub Pages. A deployed version needs a secure server-side proxy for the BU API key and authenticated per-user location preferences; never build the key into a static frontend.

## Build and Deployment

```powershell
npm run build
npm run preview -- --host 127.0.0.1
```

Set `VITE_API_BASE_URL` to the intended Worker origin before building. The backend's `ALLOWED_ORIGINS` must include the frontend origin. Both frontend and backend should use HTTPS in production.

The backend is deployed at [bu-auth-worker.tangyingkai120.workers.dev](https://bu-auth-worker.tangyingkai120.workers.dev). The tracked `.env.production` contains only this public API address, so production builds connect to the live database by default.

The default API address in the frontend and `.env.example` also points to this live service, including when running `npm run dev`. The Git-ignored `.env.local` can override it for local backend development.

For GitHub Pages deployment under the repository subpath, build with:

```powershell
npm run build:pages
```

Use the standard build command when deploying at a site's root. The page does not require client-side routing.

### GitHub Pages setup

In the GitHub repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. Push these changes to `main`. The `Deploy to GitHub Pages` workflow installs dependencies, builds with the repository subpath, and uploads only `dist`. Future pushes to `main` deploy automatically; you can also run it manually from the Actions tab.

The deployed URL is https://kamkamkamkjst824.github.io/DS-X-Hackathon-Project.github.io/ . Do not publish the source repository root directly: its `index.html` references `/src/main.js`, which requires Vite compilation and will not run as a static Pages site.

## Verification

Check desktop and mobile layouts, Tab navigation, Enter submission, disabled buttons during requests, duplicate email errors, incorrect passwords, network recovery, session restoration after reload, and signing in again after sign-out.

See the backend README for automated API tests and the Worker deployment dry run.
