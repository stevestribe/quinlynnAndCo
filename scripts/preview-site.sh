#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="${SITE_DIR:-$ROOT_DIR/site}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8765}"
OPEN_BROWSER="${OPEN_BROWSER:-1}"

if [[ ! -d "$SITE_DIR" ]]; then
  echo "Preview failed: site directory not found: $SITE_DIR" >&2
  exit 1
fi

find_available_port() {
  local host="$1"
  local port="$2"

  while ! python3 - "$host" "$port" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind((host, port))
    except OSError:
        sys.exit(1)
PY
  do
    port=$((port + 1))
  done

  echo "$port"
}

PORT="$(find_available_port "$HOST" "$PORT")"
URL="http://$HOST:$PORT/"

echo "Preview URL: $URL"
echo "Serving $SITE_DIR"
echo "Leave this terminal open while previewing. Press Ctrl-C to stop."

if [[ "$OPEN_BROWSER" != "0" ]]; then
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  else
    echo "Open this URL in your browser: $URL"
  fi
fi

python3 - "$HOST" "$PORT" "$SITE_DIR" <<'PY'
import functools
import http.server
import socketserver
import sys

host = sys.argv[1]
port = int(sys.argv[2])
site_dir = sys.argv[3]


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


handler = functools.partial(NoCacheHandler, directory=site_dir)

with socketserver.TCPServer((host, port), handler) as httpd:
    print(f"Serving HTTP on {host} port {port} (http://{host}:{port}/) ...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nKeyboard interrupt received, exiting.")
PY
