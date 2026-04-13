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
