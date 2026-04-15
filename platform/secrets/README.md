# platform/secrets

Library for resolving secret URI references.

## API

```go
fetch := secrets.NewFetcher(map[string]secrets.Provider{
    "gcp":  gcpProvider,
    "env":  env.Provider,
    "file": file.Provider,
})

data, err := fetch(ctx, "gcp:///projects/P/secrets/S/versions/3")
```

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

## CLI

See [platform/k8s/resolve-secrets](../k8s/resolve-secrets/README.md).
