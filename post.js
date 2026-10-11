// Actions Identity post step — remove the token file written by index.js.

const fs = require("fs");

const tokenFile = process.env["STATE_token-file"] || "";

if (tokenFile) {
  try {
    fs.rmSync(tokenFile, { force: true });
    console.log(`removed token_file=${tokenFile}`);
  } catch (err) {
    process.stdout.write(`::warning::Failed to remove token file: ${err.message}\n`);
  }
}
