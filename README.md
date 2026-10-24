# BU Campus Account

A web app that helps BU students decide which dining hall to eat at. Students sign in with an `@bu.edu` account, save their food preferences, and get dish recommendations across Marciano Commons, Warren Towers, and West Campus.

The frontend (this folder) is built with Vue 3, Vite, and custom CSS, with no UI component library. The Cloudflare Workers backend is maintained separately in the `Cloudflare_Part` folder.

## Project Structure

The project has two parts that are deployed independently:

```text
HACKTHON_PROJ/
├── DS-X-Hackathon-Project.github.io/   Frontend: Vue 3 single-page app, hosted on GitHub Pages
└── Cloudflare_Part/                    Backend: Cloudflare Worker + D1 database + Workers AI
```

```text
Browser (Vue app)
   │  HTTPS + JSON, Authorization: Bearer <token>
   ▼
Cloudflare Worker (bu-auth-worker)
   ├── D1 (SQLite): users, sessions, preferences, rate_limits
   ├── BU Dining API: menus and item details (cached 10 minutes)
   └── Workers AI (Llama 3.3 70B): ranks dishes, with a rule-based fallback
```

The frontend never talks to the database or the BU Dining API directly. Every request goes through the Worker, which handles authentication, validation, and the API key.

### Frontend (this folder)

```text
DS-X-Hackathon-Project.github.io/
├── index.html                  HTML entry; mounts the app on #app
├── vite.config.js              Vite + Vue plugin, dev server port, Vitest (jsdom) config
├── package.json                Scripts: dev, build, preview, test
├── .env.example                Template for VITE_API_BASE_URL
├── .env.production             Public Worker URL used by production builds
├── public/                     Static files copied as-is (favicon.svg, icons.svg)
└── src/
    ├── main.js                 Creates the Vue app and loads global styles
    ├── App.vue                 Top-level screen and session state machine
    ├── style.css               Global styles shared by every component
    ├── api.js                  request(): fetch wrapper for the Worker
    ├── auth.js                 Auth endpoints and localStorage session helpers
    ├── dining.js               Dining endpoints and shared constants
    └── components/
        ├── PreferencesForm.vue     Food preferences form
        ├── RecommendPanel.vue      Day / meal / dining hall picker and results
        ├── RecommendationCard.vue  A single recommended dish
        └── dining.test.js          Vitest tests for the three components above
```

Data layer (`src/*.js`):

- `api.js` holds `API_BASE` (from `VITE_API_BASE_URL`, falling back to the live Worker) and `request(path, { method, body, token, timeout })`. It adds JSON and Bearer headers, applies a timeout (15 s by default), turns network failures into readable messages, and throws `ApiError` with the HTTP status for non-2xx responses. All other modules call the backend through this function.
- `auth.js` wraps `/api/auth/*` as `api(path, options)`. It also reads, saves, and clears the session (`{ token, expiresAt }`) under the `bu-auth-session` localStorage key and rejects malformed values.
- `dining.js` has `getPreferences`, `savePreferences`, and `getRecommendations` (45 s timeout, because the Worker calls the BU API and the AI model). It also holds the constants the UI shares: `LOCATIONS`, `MEALS`, `MAX_DAYS_AHEAD` (it must match the Worker), `DEFAULT_PREFERENCES`, and `DIET_LABELS`, plus `diningDate()`, which computes dates in the America/New_York time zone.

UI layer:

- `App.vue` switches between four states: checking the saved session (`/api/auth/me`), connection error with a retry button, sign-in / register form, and the signed-in dashboard. The dashboard renders `PreferencesForm` and `RecommendPanel`. Both receive the `token` prop and emit `expired` on a 401, which `App.vue` handles by clearing the session and returning to sign-in.
- `PreferencesForm.vue` loads and saves `/api/preferences`. Its fields are vegetarian, vegan, gluten-free, halal, max calories per dish (50–3000), min protein per dish (0–200 g), and free-text likes (up to 300 characters). Selecting vegan also selects vegetarian.
- `RecommendPanel.vue` lets the user pick a day (today plus up to 6 days ahead), a meal ("Now" is only offered for today), and one or more dining halls, then calls `/api/recommend`. It shows the best location, a summary, warnings, and a ranked list. When the AI was unavailable, it notes that results are rule-based.
- `RecommendationCard.vue` shows one dish: location, meal, station, reason, nutrition, dietary tags, and a collapsible section with ingredients, the allergy notice, and a link to BU Dining.

### Backend (`Cloudflare_Part`)

```text
Cloudflare_Part/
├── wrangler.jsonc              Worker config: ALLOWED_ORIGINS, AI and D1 bindings
├── .dev.vars.example           Local secrets template (BU_API_KEY, ALLOWED_ORIGINS)
├── migrations/
│   ├── 0001_auth.sql           users, sessions
│   └── 0002_dining.sql         preferences, rate_limits
├── src/
│   ├── index.js                Entry: CORS, routing, auth, request handlers
│   ├── http.js                 HttpError, json(), size-limited readJson(), input checks
│   ├── preferences.js          Preference validation and D1 read/write
│   ├── ratelimit.js            Per-user fixed-window limit (6 recommendations per minute)
│   ├── recommend.js            Recommendation pipeline and response shape
│   ├── dining.js               BU Dining API client, cache, normalize, filter, rule-based ranking
│   └── llm.js                  Workers AI prompt, JSON schema, output validation
└── test/                       Node test runner suites (auth, API, recommend) with fixtures
```

API routes (all are JSON, and every route except register and login needs `Authorization: Bearer <token>`):

| Route | Purpose |
| --- | --- |
| `POST /api/auth/register` | Create an account and its first session |
| `POST /api/auth/login` | Sign in and get a 7-day token |
| `GET /api/auth/me` | Validate the token and return the user |
| `POST /api/auth/logout` | Revoke the current token |
| `GET /api/preferences` | Load the saved preferences, or the defaults |
| `PUT /api/preferences` | Validate and save preferences |
| `POST /api/recommend` | Get recommendations for `{ date, meal, locations }` |

How `POST /api/recommend` works (`recommend.js`):

1. Validate the date (today to 6 days ahead), the meal (Breakfast, Brunch, Lunch, Dinner, or `current`), and the locations.
2. Enforce the rate limit, then load the user's preferences from D1.
3. Fetch the selected halls' menus in parallel. Menus are cached for 10 minutes, and a hall that fails produces a warning instead of failing the request.
4. Flatten the chosen meal into items and apply the hard filters: diet flags, max calories, and min protein. These filters are never left to the AI.
5. Cap the candidates at 120 while keeping every hall represented, then ask Workers AI to pick up to 5 dishes and the best hall. The model output is checked against the candidate list. If the model fails, keyword matching on `likes` ranks the dishes instead (`fallback: true`).
6. Load ingredient and allergy details for each pick and return them.

Full setup, security notes, and database usage are in `Cloudflare_Part/README.md`.

### Where data lives

| Data | Location |
| --- | --- |
| Accounts, password hashes (PBKDF2) | D1 `users` |
| Login sessions (SHA-256 of the token) | D1 `sessions` |
| Food preferences | D1 `preferences`, one row per user |
| Session token in the browser | localStorage `bu-auth-session` |
| Dining menus | Not stored; fetched from BU and cached for 10 minutes in the Workers Cache |
| `BU_API_KEY` | Worker secret (`.dev.vars` locally); never sent to the browser |

## Local Development

Requires Node.js 22.12 or later. Development connects to the deployed Cloudflare API by default, so no local backend or environment file is needed. Run these commands in the frontend project folder:

```powershell
npm ci
npm run dev
```

Open [http://localhost:5174](http://localhost:5174). The development server uses port 5174 (set in `vite.config.js`) and reports an error if that port is occupied instead of silently switching to a port the API does not allow.

To use another backend, copy `.env.example` to `.env.local`, set `VITE_API_BASE_URL` to its origin without the `/api/auth` suffix, and restart Vite. For a local Worker, use `http://127.0.0.1:8787` and follow the backend README to initialize local D1 and start the Worker.

If an existing `.env.local` points to `127.0.0.1:8787` while you intend to use the deployed backend, update it to `https://bu-auth-worker.tangyingkai120.workers.dev` and restart Vite. Local environment overrides still take precedence.

## Account Features

- Switch between sign-in and registration. Registration requires an `@bu.edu` email address and a password of 8–128 characters.
- Registration signs the user in automatically and displays their email address and a sign-out button.
- The session token and expiration time are stored in localStorage. Passwords are never stored in the browser. On reload or browser restart, the app calls `/api/auth/me` to restore the session.
- Sessions last for a fixed seven days. A 401 response during session restoration clears the local session. Network failures preserve it and offer a retry button.
- Sign-out revokes the server session before clearing local data. Network failures display an error and allow another attempt.

Email ownership verification, password resets, and profile management are outside the current feature set.

## Dining Features

- Food preferences (dietary needs, max calories and min protein per dish, liked foods) are saved per account through the Worker's `/api/preferences`.
- Recommendations let users pick a day, meal, and dining halls, then call the Worker's `/api/recommend`.

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
npm run build -- --base=/DS-X-Hackathon-Project.github.io/
```

Use the standard build command when deploying at a site's root. The page does not require client-side routing.

## Verification

Check desktop and mobile layouts, Tab navigation, Enter submission, disabled buttons during requests, duplicate email errors, incorrect passwords, network recovery, session restoration after reload, and signing in again after sign-out.

See the backend README for automated API tests and the Worker deployment dry run.
