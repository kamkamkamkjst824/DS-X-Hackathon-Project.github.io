import ast
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


HOST = "127.0.0.1"
PORT = 8000
ALLOWED_ORIGINS = {
    "http://127.0.0.1:5174",
    "http://localhost:5174",
}
USER_FILE = Path(__file__).with_name("user.py")
LOCATION_IDS = {"warren", "west", "marciano"}
MAX_REQUEST_BYTES = 2048


def validate_preferences(preferences, allow_empty=False):
    if allow_empty and preferences == []:
        return preferences

    if not isinstance(preferences, list) or len(preferences) != 3:
        raise ValueError("Provide one rank for each of the three dining locations.")

    if any(
        not isinstance(item, dict)
        or set(item) != {"rank", "location"}
        or type(item["rank"]) is not int
        or not isinstance(item["location"], str)
        or item["location"] not in LOCATION_IDS
        for item in preferences
    ):
        raise ValueError("Preference entries must contain a valid rank and location.")

    if {item["rank"] for item in preferences} != {1, 2, 3}:
        raise ValueError("Ranks must be unique and range from 1 to 3.")

    if {item["location"] for item in preferences} != LOCATION_IDS:
        raise ValueError("Choose Warren, West, and Marciano exactly once.")

    return sorted(preferences, key=lambda item: item["rank"])


def read_preferences():
    module = ast.parse(USER_FILE.read_text(encoding="utf-8"), filename=str(USER_FILE))
    for statement in module.body:
        if isinstance(statement, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "LOCATION_PREFERENCES"
            for target in statement.targets
        ):
            return validate_preferences(ast.literal_eval(statement.value), allow_empty=True)
    raise ValueError("user.py must define LOCATION_PREFERENCES.")


def write_preferences(preferences):
    value = json.dumps(preferences, indent=4)
    contents = f"LOCATION_PREFERENCES = {value}\n"
    temporary_file = USER_FILE.with_suffix(".py.tmp")
    temporary_file.write_text(contents, encoding="utf-8")
    temporary_file.replace(USER_FILE)


class PreferenceHandler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/api/preferences":
            self.send_json(404, {"error": "Not found."})
            return

        try:
            self.send_json(200, {"preferences": read_preferences()})
        except (OSError, SyntaxError, ValueError) as error:
            self.send_json(500, {"error": f"Could not read user.py: {error}"})

    def do_POST(self):
        if self.path != "/api/preferences":
            self.send_json(404, {"error": "Not found."})
            return

        if self.headers.get("Origin") not in ALLOWED_ORIGINS:
            self.send_json(403, {"error": "Requests from this website are not allowed."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "Invalid request length."})
            return

        if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
            self.send_json(413, {"error": "Request is empty or too large."})
            return

        try:
            payload = json.loads(self.rfile.read(content_length))
            preferences = validate_preferences(payload.get("preferences"))
        except (json.JSONDecodeError, UnicodeDecodeError, AttributeError, ValueError) as error:
            self.send_json(400, {"error": f"Invalid preferences: {error}"})
            return

        try:
            write_preferences(preferences)
        except OSError as error:
            self.send_json(500, {"error": f"Could not save user.py: {error}"})
            return

        self.send_json(200, {"preferences": preferences})

    def log_message(self, format_string, *args):
        print(f"{self.address_string()} - {format_string % args}")


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), PreferenceHandler)
    print(f"Preference server listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPreference server stopped.")
    finally:
        server.server_close()
