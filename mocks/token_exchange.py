"""Stub id-token exchange endpoint for the smoke job.

Answers like npm trusted publishing: POST /token-exchange returns
{"token": "exchanged-ok"}; any other path returns 403. The Authorization
header of each request is written to $RUNNER_TEMP/exchange_bearer so the
workflow can assert what was sent.

Usage: python3 mocks/token_exchange.py [port]

Daemonizes itself once the port is listening, so the command returns only
when the server is ready: no `&`, and no wait loop in the workflow.
"""

import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT_DIR = os.environ.get("RUNNER_TEMP") or tempfile.gettempdir()
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        with open(os.path.join(OUT_DIR, "exchange_bearer"), "w") as f:
            f.write(self.headers.get("Authorization", ""))
        if self.path == "/token-exchange":
            body = json.dumps({"token": "exchanged-ok"}).encode()
            self.send_response(200)
        else:
            body = b'{"message":"denied"}'
            self.send_response(403)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)


# Bind (and listen) before forking: once the parent exits, connections succeed.
server = HTTPServer(("127.0.0.1", PORT), Handler)
print(f"token exchange stub listening on http://127.0.0.1:{PORT}", flush=True)

# Double-fork so the server is reparented away from the step's shell and can't
# reacquire a controlling terminal.
if os.fork() > 0:
    os._exit(0)
os.setsid()
if os.fork() > 0:
    os._exit(0)

# Detach stdio so the runner isn't left waiting on the step's output pipes.
devnull = os.open(os.devnull, os.O_RDWR)
for fd in (0, 1, 2):
    os.dup2(devnull, fd)

server.serve_forever()
