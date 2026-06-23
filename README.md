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

When the job grants `permissions: id-token: write`, the action also fetches an
**OIDC id-token** from `ACTIONS_ID_TOKEN_REQUEST_URL` and exposes it. The
`token` output then resolves to the id-token; without the permission it falls
back to the runtime token, so consumers can use a single output either way.

## Inputs

| input               | required | description                                                                                                                                 |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id-token-audience` | no       | Audience (`aud` claim) for the OIDC id-token. Appended as `&audience=` to the token request. Ignored when `id-token: write` is not granted. |

## Outputs

| output                 | description                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `token`                | Resolved identity token: the OIDC id-token when `id-token: write` is granted, else `runtime-token`. Masked in logs. |
| `runtime-token`        | `ACTIONS_RUNTIME_TOKEN` — per-job bearer for the Actions services. Masked in logs.                                  |
| `runtime-url`          | `ACTIONS_RUNTIME_URL` — pipelines service base URL for the job.                                                     |
| `results-url`          | `ACTIONS_RESULTS_URL` — results/cache/artifact Twirp service base URL.                                              |
| `cache-url`            | `ACTIONS_CACHE_URL` — legacy artifactcache service base URL.                                                        |
| `id-token`             | OIDC JWT fetched when `id-token: write` is granted; empty otherwise. Masked in logs.                                |
| `id-token-request-url` | `ACTIONS_ID_TOKEN_REQUEST_URL` — OIDC token request endpoint for the job.                                           |

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

### With OIDC (`id-token: write`)

Grant the permission and the `token` output becomes the OIDC id-token. Set
`id-token-audience` to scope the `aud` claim (e.g. for a cloud provider).

```yaml
jobs:
  demo:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # required for the OIDC id-token
    steps:
      - id: identity
        uses: cnuss/actions-identity@main
        with:
          id-token-audience: sts.amazonaws.com

      - shell: bash
        env:
          ID_TOKEN: ${{ steps.identity.outputs.id-token }}
        run: |
          # JWT has three dot-separated parts; decode the payload (claims).
          echo "$ID_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

## Notes

- Dependency-free: no `node_modules`, no bundling, no build step.
- The token is the calling workflow's own short-lived job token — it expires
  with the job. This action does not exfiltrate anyone else's secrets.
