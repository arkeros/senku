# resolve-secrets

Resolves secret URI references in Kubernetes manifests before applying them.

## Usage

```sh
resolve-secrets -f manifest.yaml | kubectl apply -f -
cat manifest.yaml | resolve-secrets | kubectl apply -f -
```

Reads from stdin by default (`-f -`).

## How it works

Every `kind: Secret` document is scanned for URI references:

- **`stringData`** values are resolved directly. Every value must be a valid
  provider URI; plain strings are rejected.
- **`data`** values are inspected as raw bytes. If the value is a provider URI
  it is resolved. Non-URI values are left unchanged.

Non-Secret documents pass through untouched.

The entire output is buffered before writing to stdout. If resolution fails
for any secret, nothing reaches kubectl, preventing `--prune` from deleting
resources based on a partial manifest.

## Provider URIs

| Scheme | Example                                  | Description                                                |
| ------ | ---------------------------------------- | ---------------------------------------------------------- |
| `gcp`  | `gcp:///projects/P/secrets/S/versions/3` | GCP Secret Manager. Version must be numeric (no `latest`). |
| `env`  | `env://VAR_NAME`                         | Environment variable.                                      |
| `file` | `file:///path/to/secret`                 | Local file.                                                |

## Spread

Keys prefixed with `...` spread a JSON secret into multiple K8s Secret keys:

```yaml
stringData:
  ...db: gcp:///projects/P/secrets/db-config/versions/1
  ...redis: gcp:///projects/P/secrets/redis-config/versions/1
  port: "5433"  # explicit override
```

If `db-config` contains `{"host":"db.internal","port":"5432","user":"admin"}`,
the resolved Secret will have keys `host`, `port`, `user`, `redis-host`, etc.

The suffix after `...` is a disambiguator (ignored by the resolver).
Transforms compose: `...db: gcp:///...?payload=base64` works.

### Collision rules

- **Spread vs spread**: if two spreads produce the same key → **hard error**
- **Explicit vs spread**: explicit keys always win (no error)

## Usage with kustomize

Kustomize `secretGenerator` produces `data` (base64-encoded) fields. Place
provider URIs as literal values and the resolver will decode, resolve, and
re-encode them:

```yaml
secretGenerator:
    - name: db-credentials
      literals:
          - password=gcp:///projects/123456789/secrets/DB_PASS/versions/1
```

Note: `secretGenerator` appends a hash suffix to secret names (e.g.
`db-credentials-k97m6822d8`). Kustomize auto-updates references in standard
fields (`secretKeyRef`, `volumes.secret.secretName`, etc.), but CRD fields
like `spec.auth.secretPath` in a `RedisFailover` require either:

- Per-generator `options.disableNameSuffixHash: true`, or
- A kustomize `nameReference` configuration for the CRD field
