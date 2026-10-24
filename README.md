# BU dining location preference

This Vue page lets a user rank Warren, West, and Marciano. Saving sends the
ranked locations to a local Python server, which validates the order and writes
it to `user.py`. The page loads the saved order from that file on reload.

## Run locally

Requires Node.js and Python 3. Start the Python server in one terminal:

```sh
python3 preference_server.py
```

Start Vite in another terminal:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open <http://127.0.0.1:5174/>. The Vite development server forwards `/api`
requests to the Python server on port 8000. Stop either server with Ctrl+C.

## Storage limitation

`user.py` is one shared local demo file. Each successful save replaces its
contents, so this setup is for local testing and does not support multiple
users, concurrent saves, or persistence on static GitHub Pages. A deployed
multi-user site needs an authenticated backend and per-user database records.
