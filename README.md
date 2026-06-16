# actions-identity

[![CodeQL](https://github.com/cnuss/actions-identity/actions/workflows/codeql.yml/badge.svg)](https://github.com/cnuss/actions-identity/actions/workflows/codeql.yml)
[![Latest release](https://img.shields.io/github/v/release/cnuss/actions-identity?sort=semver&logo=github)](https://github.com/cnuss/actions-identity/releases/latest)
[![Dependabot](https://img.shields.io/badge/dependabot-enabled-025E8C?logo=dependabot)](https://github.com/cnuss/actions-identity/security/dependabot)
[![Security policy](https://img.shields.io/badge/security-policy-brightgreen)](./SECURITY.md)

A GitHub composite/node action that exposes the **runner-injected** Actions
runtime credentials as step outputs.

The runner injects `ACTIONS_RUNTIME_TOKEN` and `ACTIONS_RUNTIME_URL` into the
process environment of **node and docker actions**, but withholds them from
plain `run:` shells. This action reads them from `process.env` and re-emits them
as outputs, so a downstream bash step can use them (e.g. to call the Actions
cache / results / artifact services with raw cURL).

## Outputs

| output | description |
|---|---|
| `runtime-token` | `ACTIONS_RUNTIME_TOKEN` — per-job bearer for the Actions services. Masked in logs. |
| `runtime-url` | `ACTIONS_RUNTIME_URL` — pipelines service base URL for the job. |
| `results-url` | `ACTIONS_RESULTS_URL` — results/cache/artifact Twirp service base URL. |
| `cache-url` | `ACTIONS_CACHE_URL` — legacy artifactcache service base URL. |
| `token` | Alias of `runtime-token`. |

No inputs (for now).

## Usage

```yaml
jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - id: identity
        uses: cnuss/actions-identity@main

      - shell: bash
        env:
          TOKEN: ${{ steps.identity.outputs.token }}
          RESULTS_URL: ${{ steps.identity.outputs.results-url }}
        run: |
          echo "results_url = $RESULTS_URL"
          echo "token length = ${#TOKEN}"
```

## Notes

- Dependency-free: no `node_modules`, no bundling, no build step.
- The token is the calling workflow's own short-lived job token — it expires
  with the job. This action does not exfiltrate anyone else's secrets.
