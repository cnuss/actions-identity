// Actions Identity — expose the runner-injected ACTIONS_RUNTIME_* env as outputs.
//
// The runner injects ACTIONS_RUNTIME_TOKEN / ACTIONS_RUNTIME_URL into the process
// env of node (and docker) actions, but NOT into `run:` shells. This action reads
// them from process.env and writes them back out as step outputs so a pure-bash
// step downstream can consume them via ${{ steps.<id>.outputs.* }}.
//
// Dependency-free: no @actions/core, no node_modules, no build step.

const fs = require('fs');
const crypto = require('crypto');

function issueCommand(command, message) {
  process.stdout.write(`::${command}::${message}\n`);
}

function setOutput(name, value) {
  const filePath = process.env.GITHUB_OUTPUT;
  const val = value ?? '';
  if (!filePath) {
    // Fallback for older runners without the file command.
    issueCommand('set-output name=' + name, val);
    return;
  }
  // Heredoc form is multiline/special-char safe. Random delimiter avoids
  // collisions with the value (a JWT here, but be defensive anyway).
  const delimiter = 'ghadelimiter_' + crypto.randomBytes(16).toString('hex');
  fs.appendFileSync(filePath, `${name}<<${delimiter}\n${val}\n${delimiter}\n`);
}

const token = process.env.ACTIONS_RUNTIME_TOKEN || '';
const url = process.env.ACTIONS_RUNTIME_URL || '';

// Keep the token out of logs even though the runner usually masks it already.
if (token) {
  issueCommand('add-mask', token);
}

setOutput('actions_runtime_token', token);
setOutput('token', token); // duplicate / alias
setOutput('actions_runtime_url', url);

if (!token) {
  issueCommand('warning', 'ACTIONS_RUNTIME_TOKEN not present in env — runner may not inject it for this action type.');
}
console.log(`actions_runtime_url=${url || '<empty>'}`);
console.log(`actions_runtime_token=${token ? '<set, masked>' : '<empty>'}`);
