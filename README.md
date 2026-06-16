# actions-identity

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
| `actions_runtime_token` | `ACTIONS_RUNTIME_TOKEN` — per-job bearer for the Actions services. Masked in logs. |
| `actions_runtime_url` | `ACTIONS_RUNTIME_URL` — pipelines service base URL for the job. |
| `token` | Alias of `actions_runtime_token`. |

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
          RUNTIME_TOKEN: ${{ steps.identity.outputs.token }}
          RUNTIME_URL: ${{ steps.identity.outputs.actions_runtime_url }}
        run: |
          echo "url = $RUNTIME_URL"
          echo "token length = ${#RUNTIME_TOKEN}"
```

## Notes

- Dependency-free: no `node_modules`, no bundling, no build step.
- The token is the calling workflow's own short-lived job token — it expires
  with the job. This action does not exfiltrate anyone else's secrets.
