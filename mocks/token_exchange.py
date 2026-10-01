"""Stub id-token exchange endpoint for the smoke job.

Answers like npm trusted publishing: POST /ok returns {"token": ...}; any
other path returns 403. The Authorization header of each request is written
to <out-dir>/exchange_bearer so the workflow can assert what was sent.

Usage: python3 mocks/token_exchange.py <out-dir> [port]
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT_DIR = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8787


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        with open(os.path.join(OUT_DIR, "exchange_bearer"), "w") as f:
            f.write(self.headers.get("Authorization", ""))
        if self.path == "/ok":
            body = json.dumps({"token": "stub-exchanged-token"}).encode()
            self.send_response(200)
        else:
            body = b'{"message":"denied"}'
            self.send_response(403)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)


HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
