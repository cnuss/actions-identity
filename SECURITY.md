# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `v1.x` (tag `v1`) | :white_check_mark: |
| `< v1` | :x: |

Always pin to a released tag — `uses: cnuss/actions-identity@v1` (moving major)
or a full commit SHA for maximum supply-chain safety.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately via GitHub's **Private Vulnerability Reporting**:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** (Advisories → Report).
3. Describe the issue, affected versions, and reproduction steps.

You will get an acknowledgement within **3 business days**. Once confirmed, a
fix and a GitHub Security Advisory (with CVE if warranted) will be published,
and the moving `v1` tag updated.

## Scope

This action reads runner-injected environment (`ACTIONS_RUNTIME_TOKEN`,
`ACTIONS_RUNTIME_URL`, `ACTIONS_RESULTS_URL`, `ACTIONS_CACHE_URL`) and re-emits
them as step outputs for the **calling** workflow. It holds no secrets of its
own and exfiltrates nothing off-runner. The token surfaced is the caller's own
short-lived job token, which expires with the job.

In scope: code execution, output injection, token leakage to logs despite the
`add-mask`, or supply-chain tampering with releases/tags.

Out of scope: misuse by a workflow that deliberately prints the token it asked
for.
