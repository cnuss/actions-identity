"""Stub token exchange endpoint for the smoke job.

Answers like npm trusted publishing: POST /token-exchange returns
{"token": <jwt>}; any other path returns 403. The token is an unsigned JWT
(alg "none") whose claims describe the bearer it received: its sub/aud, and
token_sha256 so the workflow can check which token was sent by decoding the
claims, which survive log masking of the token itself.

Usage: python3 mocks/token_exchange.py [port]

Daemonizes itself once the port is listening, so the command returns only
when the server is ready: no `&`, and no wait loop in the workflow.
"""

import base64
import hashlib
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787


def b64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def jwt_claims(token):
    """Decode a JWT's payload without verifying it; {} if it isn't one."""
    try:
        payload = token.split(".")[1]
        padded = payload + "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except (IndexError, ValueError):
        return {}


def mint_token(token):
    claims = jwt_claims(token)
    now = int(time.time())
    header = {"alg": "none", "typ": "JWT"}
    payload = {
        "iss": "mocks/token_exchange.py",
        "sub": claims.get("sub"),
        "aud": claims.get("aud"),
        "iat": now,
        "exp": now + 300,
        "token_sha256": hashlib.sha256(token.encode()).hexdigest(),
    }
    return ".".join(
        b64url_encode(json.dumps(part, separators=(",", ":")).encode())
        for part in (header, payload)
    ) + "."


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        auth = self.headers.get("Authorization", "")
        if self.path == "/token-exchange" and auth.startswith("Bearer "):
            body = json.dumps({"token": mint_token(auth[len("Bearer "):])}).encode()
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
