# platform/kubernetes/secrets

Library for resolving secret URI references in Kubernetes Secret objects.

## API

```go
secrets.Resolve(ctx, secret, fetch)
```

Operates on a typed `*corev1.Secret`:

- **`StringData`** values are resolved directly. Every value must be a valid
  provider URI; plain strings are rejected.
- **`Data`** values are inspected as raw bytes. If the value is a provider URI
  it is resolved. Non-URI values are left unchanged.

## Providers

| Scheme | Example                                  | Description                                                |
| ------ | ---------------------------------------- | ---------------------------------------------------------- |
| `gcp`  | `gcp:///projects/P/secrets/S/versions/3` | GCP Secret Manager. Version must be numeric (no `latest`). |
| `env`  | `env://VAR_NAME`                         | Environment variable.                                      |
| `file` | `file:///path/to/secret`                 | Local file.                                                |

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

## CLI

See [devtools/resolve-secrets](../../devtools/resolve-secrets/README.md).
