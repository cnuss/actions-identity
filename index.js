// Actions Identity — expose the runner-injected ACTIONS_RUNTIME_* env as outputs.
//
// The runner injects ACTIONS_RUNTIME_TOKEN / ACTIONS_RUNTIME_URL into the process
// env of node (and docker) actions, but NOT into `run:` shells. This action reads
// them from process.env and writes them back out as step outputs so a pure-bash
// step downstream can consume them via ${{ steps.<id>.outputs.* }}.
//
// Dependency-free: no @actions/core, no node_modules, no build step.

const fs = require("fs");
const crypto = require("crypto");

function issueCommand(command, message) {
  process.stdout.write(`::${command}::${message}\n`);
}

function setOutput(name, value) {
  const filePath = process.env.GITHUB_OUTPUT;
  const val = value ?? "";
  if (!filePath) {
    // Fallback for older runners without the file command.
    issueCommand("set-output name=" + name, val);
    return;
  }
  // Heredoc form is multiline/special-char safe. Random delimiter avoids
  // collisions with the value (a JWT here, but be defensive anyway).
  const delimiter = "ghadelimiter_" + crypto.randomBytes(16).toString("hex");
  fs.appendFileSync(filePath, `${name}<<${delimiter}\n${val}\n${delimiter}\n`);
}

const runtimeToken = process.env.ACTIONS_RUNTIME_TOKEN || "";
const runtimeUrl = process.env.ACTIONS_RUNTIME_URL || "";
const resultsUrl = process.env.ACTIONS_RESULTS_URL || "";
const cacheUrl = process.env.ACTIONS_CACHE_URL || "";
const idTokenRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || "";
const idTokenRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL || "";
const idTokenAudience = process.env["INPUT_ID-TOKEN-AUDIENCE"] || "";
const idTokenExchangeUrl = process.env["INPUT_ID-TOKEN-EXCHANGE-URL"] || "";

if (!runtimeToken) {
  issueCommand(
    "warning",
    "ACTIONS_RUNTIME_TOKEN not present in env — runner may not inject it for this action type.",
  );
}

// The id-token is a bearer credential: only send it over https. Plain http is
// allowed for loopback hosts so a local stub can stand in for a real endpoint.
function checkExchangeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`id-token-exchange-url is not a valid URL: ${raw}`);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(`id-token-exchange-url must use https: ${raw}`);
  }
  return url;
}

// POST the id-token as a bearer to the exchange endpoint and return the
// `token` field of the JSON response (npm trusted publishing shape).
function exchangeIdToken(idToken) {
  return Promise.resolve()
    .then(() =>
      fetch(checkExchangeUrl(idTokenExchangeUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: "application/json",
        },
      }),
    )
    .then(async (res) => {
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 500);
        throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ""}`);
      }
      return res.json();
    })
    .then((data) => {
      if (typeof data?.token !== "string" || !data.token) {
        throw new Error("response missing token");
      }
      return data.token;
    });
}

// Resolves to the OIDC id-token, or "" when the permission/env is absent or
// the request fails.
const idTokenP =
  idTokenRequestToken && idTokenRequestUrl
    ? fetch(
        // Append audience query param if requested. The runner will ignore it if the permission is not granted.
        idTokenRequestUrl && idTokenAudience
          ? `${idTokenRequestUrl}&audience=${encodeURIComponent(idTokenAudience)}`
          : idTokenRequestUrl,
        {
          headers: {
            Authorization: `Bearer ${idTokenRequestToken}`,
            Accept: "application/json; api-version=2.0",
          },
        },
      )
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!data?.value) throw new Error("response missing id-token value");
          return data.value;
        })
        .then((idToken) => {
          issueCommand("add-mask", idToken);
          setOutput("id-token", idToken);
          return idToken;
        })
        .catch((err) => {
          issueCommand("warning", `Failed to fetch ID token: ${err.message}`);
          return "";
        })
    : Promise.resolve("");

// Resolves to the `token` output: the exchanged token when
// id-token-exchange-url is set, else the id-token, else the runtime token.
// Rejects when an exchange was requested but can't produce a token — falling
// back would hand consumers a credential the target service rejects.
const tokenP = idTokenP.then((idToken) => {
  issueCommand("add-mask", runtimeToken);
  setOutput("runtime-token", runtimeToken);

  if (!idTokenExchangeUrl) return idToken || runtimeToken;
  if (!idToken) {
    throw new Error(
      "id-token-exchange-url is set but no id-token is available (is `id-token: write` granted?)",
    );
  }
  return exchangeIdToken(idToken).then(
    (exchanged) => {
      issueCommand("add-mask", exchanged);
      setOutput("id-token-exchange", exchanged);
      return exchanged;
    },
    (err) => {
      throw new Error(`Failed to exchange id-token: ${err.message}`);
    },
  );
});

setOutput("runtime-url", runtimeUrl);
setOutput("results-url", resultsUrl);
setOutput("cache-url", cacheUrl);
setOutput("id-token-request-url", idTokenRequestUrl);

console.log(`id_token_request_url=${idTokenRequestUrl || "<empty>"}`);
console.log(`runtime_url=${runtimeUrl || "<empty>"}`);
console.log(`results_url=${resultsUrl || "<empty>"}`);
console.log(`cache_url=${cacheUrl || "<empty>"}`);

tokenP
  .then((token) => {
    setOutput("token", token); // see action.yml for resolution order
    console.log(`token=${token ? "<set, masked>" : "<empty>"}`);
  })
  .catch((err) => {
    issueCommand("error", err.message);
    process.exitCode = 1;
  });
