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

## Transforms

Transforms are provider-agnostic and applied in a three-phase pipeline:

```
payload (ingress) → JSON Pointer (process) → decode (egress)
```

| Mechanism | Phase | Purpose | Example |
| --- | --- | --- | --- |
| `?payload=base64` | Ingress | Base64-decode the raw payload **before** extraction | `env://MY_SECRET?payload=base64` |
| `#/path` | Process | Extract a field via JSON Pointer ([RFC 6901](https://datatracker.ietf.org/doc/html/rfc6901)) | `gcp:///...#/password` |
| `?decode=base64` | Egress | Base64-decode the result **after** extraction | `env://MY_SECRET?decode=base64` |

### JSON Pointer (RFC 6901)

Use a URI fragment to extract a field from a JSON secret:

```
gcp:///projects/P/secrets/config/versions/1#/password
gcp:///projects/P/secrets/config/versions/1#/database/host
```

Array indexing is supported:

```
gcp:///projects/P/secrets/users/versions/1#/users/0
```

Escaping (per RFC 6901): `~0` for `~`, `~1` for `/`.

### Common patterns

**JSON secret with a base64-encoded field** (extract, then decode):

```
gcp:///projects/P/secrets/certs/versions/1?decode=base64#/tls_cert
```

**Base64-encoded JSON in an env var** (decode, then extract):

```
env://MY_SECRET?payload=base64#/password
```

**Both** (decode, extract, decode):

```
env://MY_SECRET?payload=base64&decode=base64#/cert
```

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

## CLI

See [devtools/resolve-secrets](../../devtools/resolve-secrets/README.md).
