// Stub token exchange endpoint for the smoke job.
//
// Answers like npm trusted publishing: POST /token-exchange returns
// {"token": <jwt>}; any other path returns 403. The token is an unsigned JWT
// (alg "none") whose claims describe the bearer it received: its sub/aud, and
// token_sha256 so the workflow can check which token was sent by decoding the
// claims, which survive log masking of the token itself.
//
// Usage: node mocks/token-exchange.js [port]
//
// Runs the server in a detached child and returns only once it is listening:
// no `&`, and no wait loop in the workflow.

const crypto = require("crypto");
const http = require("http");
const { spawn } = require("child_process");

const PORT = Number(process.argv[2] || 8787);

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

// Decode a JWT's payload without verifying it; {} if it isn't one.
function jwtClaims(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return {};
  }
}

function mintToken(token) {
  const claims = jwtClaims(token);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    iss: "mocks/token-exchange.js",
    sub: claims.sub ?? null,
    aud: claims.aud ?? null,
    iat: now,
    exp: now + 300,
    token_sha256: crypto.createHash("sha256").update(token).digest("hex"),
  };
  return `${b64url(header)}.${b64url(payload)}.`;
}

function serve() {
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || "";
    let status = 403;
    let body = { message: "denied" };
    if (
      req.method === "POST" &&
      req.url === "/token-exchange" &&
      auth.startsWith("Bearer ")
    ) {
      status = 200;
      body = { token: mintToken(auth.slice("Bearer ".length)) };
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  server.on("error", (err) => {
    process.send({ error: err.message });
    process.exit(1);
  });
  server.listen(PORT, "127.0.0.1", () => {
    process.send({ ready: true });
    process.disconnect();
  });
}

// Parent: spawn ourselves detached (own session, no inherited stdio, so the
// runner isn't left waiting on the step's output pipes) and exit once the
// child reports it is listening.
function launch() {
  const child = spawn(process.execPath, [__filename, String(PORT)], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  child.once("message", (msg) => {
    child.removeAllListeners("exit");
    if (msg.error) {
      console.error(`token exchange stub failed to start: ${msg.error}`);
      process.exit(1);
    }
    console.log(`token exchange stub listening on http://127.0.0.1:${PORT}`);
    child.disconnect();
    child.unref();
  });
  child.once("exit", (code) => {
    console.error(`token exchange stub exited early (code ${code})`);
    process.exit(1);
  });
}

// A child spawned with an IPC channel has process.send; the CLI parent doesn't.
if (process.send) serve();
else launch();
