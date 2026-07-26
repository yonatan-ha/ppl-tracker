"""Static dev server that never lets the browser cache anything.

Plain `python -m http.server` sends no cache headers, so browsers apply
heuristic caching and keep serving stale ES modules after an edit.

    python tools/serve.py [port]
"""

import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8643
    print(f"serving {ROOT} on http://localhost:{port} (no-store)")
    HTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
