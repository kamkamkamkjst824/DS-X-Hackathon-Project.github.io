"""Tiny local-only API for NutritionPreferences.vue; run: python3 preferences_server.py."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from userdata import save_preferences

ORIGIN = 'http://localhost:5173'
ALLOWED_ORIGINS = {ORIGIN, 'http://127.0.0.1:5173'}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _reply(self, status, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if self.path != '/api/preferences':
            self._reply(404, {'error': 'Not found'})
            return
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != '/api/preferences':
            self._reply(404, {'error': 'Not found'})
            return
        if self.headers.get('Origin') not in ALLOWED_ORIGINS:
            self._reply(403, {'error': 'Origin not allowed'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 4096:
                self._reply(413, {'error': 'Invalid request size'})
                return
            payload = json.loads(self.rfile.read(size))
            saved = save_preferences(payload)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self._reply(400, {'error': str(exc)})
            return
        self._reply(200, {'preferences': saved})


if __name__ == '__main__':
    print('Nutrition preferences API: http://127.0.0.1:8000/api/preferences')
    ThreadingHTTPServer(('127.0.0.1', 8000), Handler).serve_forever()
