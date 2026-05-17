#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="$(cd "$(dirname "$0")/../site" && pwd)"
PORT="${PORT:-8080}"

echo "Serving Quinlynn & Co. site at http://localhost:${PORT}"
echo "Press Ctrl+C to stop."

if command -v python3 &>/dev/null; then
  python3 -m http.server "$PORT" --directory "$SITE_DIR"
elif command -v python &>/dev/null; then
  (cd "$SITE_DIR" && python -m SimpleHTTPServer "$PORT")
else
  echo "Error: python3 or python is required to preview the site." >&2
  exit 1
fi
