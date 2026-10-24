# BU Campus Account

A minimal English sign-in and registration interface built with Vue 3, Vite, and custom CSS. No UI component library is required. The Cloudflare Workers backend is maintained separately in the `Cloudflare_Part` folder.

## Local Development

Requires Node.js 22.12 or later. To use the local backend, follow its README to initialize the local D1 database and start the Worker. Then run these commands in the frontend project folder:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The default API address is `http://127.0.0.1:8787`. To use another backend, set `VITE_API_BASE_URL` in `.env.local` to its origin, without the `/api/auth` suffix, and restart Vite.

## Account Features

- Switch between sign-in and registration. Registration requires an `@bu.edu` email address and a password of 8–128 characters.
- Registration signs the user in automatically and displays their email address and a sign-out button.
- The session token and expiration time are stored in localStorage. Passwords are never stored in the browser. On reload or browser restart, the app calls `/api/auth/me` to restore the session.
- Sessions last for a fixed seven days. A 401 response during session restoration clears the local session. Network failures preserve it and offer a retry button.
- Sign-out revokes the server session before clearing local data. Network failures display an error and allow another attempt.

Email ownership verification, password resets, and profile management are outside the current feature set.

## Build and Deployment

```powershell
npm run build
npm run preview -- --host 127.0.0.1
```

Set `VITE_API_BASE_URL` to the intended Worker origin before building. The backend's `ALLOWED_ORIGINS` must include the frontend origin. Both frontend and backend should use HTTPS in production.

The backend is deployed at [bu-auth-worker.tangyingkai120.workers.dev](https://bu-auth-worker.tangyingkai120.workers.dev). The tracked `.env.production` contains only this public API address, so production builds connect to the live database by default.

On the current development machine, the Git-ignored `.env.local` also points to the live API. To switch back to the local backend, change its URL to `http://127.0.0.1:8787`. Other development environments can copy `.env.example` to configure the local API.

For GitHub Pages deployment under the repository subpath, build with:

```powershell
npm run build -- --base=/DS-X-Hackathon-Project.github.io/
```

Use the standard build command when deploying at a site's root. The page does not require client-side routing.

## Verification

Check desktop and mobile layouts, Tab navigation, Enter submission, disabled buttons during requests, duplicate email errors, incorrect passwords, network recovery, session restoration after reload, and signing in again after sign-out.

See the backend README for automated API tests and the Worker deployment dry run.
