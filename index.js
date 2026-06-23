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

if (!runtimeToken) {
  issueCommand(
    "warning",
    "ACTIONS_RUNTIME_TOKEN not present in env — runner may not inject it for this action type.",
  );
}

let tokenP =
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
          setOutput("runtime-token", runtimeToken);
          setOutput("id-token", idToken);
          return idToken;
        })
        .catch((err) => {
          issueCommand("warning", `Failed to fetch ID token: ${err.message}`);
          issueCommand("add-mask", runtimeToken);
          setOutput("runtime-token", runtimeToken);
          return runtimeToken;
        })
    : Promise.resolve().then(() => {
        issueCommand("add-mask", runtimeToken);
        setOutput("runtime-token", runtimeToken);
        return runtimeToken;
      });

tokenP.then((token) => {
  setOutput("token", token); // id-token if available, else runtime-token (see action.yml)
  setOutput("runtime-url", runtimeUrl);
  setOutput("results-url", resultsUrl);
  setOutput("cache-url", cacheUrl);
  setOutput("id-token-request-url", idTokenRequestUrl);

  console.log(`id_token_request_url=${idTokenRequestUrl || "<empty>"}`);
  console.log(`runtime_url=${runtimeUrl || "<empty>"}`);
  console.log(`results_url=${resultsUrl || "<empty>"}`);
  console.log(`cache_url=${cacheUrl || "<empty>"}`);
  console.log(`token=${token ? "<set, masked>" : "<empty>"}`);
});
