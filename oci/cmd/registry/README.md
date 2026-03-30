# registry

Pull-only OCI registry proxy that serves images from GHCR under a custom domain.

This is similar in spirit to [archeio](https://github.com/kubernetes/registry.k8s.io/blob/main/cmd/archeio/README.md),
the proxy behind `registry.k8s.io`, but much simpler since we only need to front a single upstream registry.

## Why

**Vanity domain.** Publishing container images to `ghcr.io/arkeros/senku/redis` ties image references to a
specific hosting provider. A custom domain like `distroless.io/redis` decouples the public-facing image name
from the backend, so we can migrate to a different registry (GAR, ECR, self-hosted, etc.) without breaking
existing references.

**Minimal cost.** The proxy only handles metadata requests (manifests, tags). Blob requests — which make up
the vast majority of bandwidth — are redirected to the upstream registry, so the proxy never transfers
image layer data. This keeps Cloud Run costs near zero since blob traffic flows directly between the client
and GHCR.

## How it works

Manifests and tags are proxied (small metadata):

```
Client                    Proxy (Cloud Run)              GHCR
  |                           |                            |
  |  GET /v2/redis/           |                            |
  |  manifests/latest         |                            |
  |-------------------------->|                            |
  |                           |  GET /v2/arkeros/senku/    |
  |                           |  redis/manifests/latest    |
  |                           |--------------------------->|
  |                           |                            |
  |                           |  200 OK + manifest         |
  |                           |<---------------------------|
  |  200 OK + manifest        |                            |
  |<--------------------------|                            |
```

Blobs are redirected (large layer data never flows through the proxy).
GHCR redirects to `pkg-containers.githubusercontent.com`:

```
Client                    Proxy (Cloud Run)              GHCR              CDN
  |                           |                            |                |
  |  GET /v2/redis/           |                            |                |
  |  blobs/sha256:abc...      |                            |                |
  |-------------------------->|                            |                |
  |                           |  GET /v2/arkeros/senku/    |                |
  |                           |  redis/blobs/sha256:abc... |                |
  |                           |--------------------------->|                |
  |                           |                            |                |
  |                           |  307 Location: CDN         |                |
  |                           |<---------------------------|                |
  |  307 Location: CDN        |                            |                |
  |<--------------------------|                            |                |
  |                                                                         |
  |  GET blob data (direct, bypasses proxy)                                 |
  |------------------------------------------------------------------------>|
  |                                                                         |
  |  200 OK + blob data                                                     |
  |<------------------------------------------------------------------------|
```

The proxy:
1. Receives OCI Distribution API requests at `/v2/<name>/...`
2. Rewrites paths by prepending the repository prefix: `/v2/arkeros/senku/<name>/...`
3. Handles upstream auth transparently via the standard OCI token challenge flow
   (using [go-containerregistry](https://github.com/google/go-containerregistry)'s transport)
4. Passes through redirect responses for blobs — the proxy never serves blob data itself,
   clients are redirected to the upstream's storage backend (CDN) directly

## Usage

```
registry --upstream=ghcr.io --repository-prefix=arkeros/senku --port=8080
```

## Supported endpoints

- `GET /v2/` — API version check
- `GET /v2/<name>/manifests/<reference>` — pull manifests
- `GET /v2/<name>/blobs/<digest>` — pull blobs (including redirect passthrough)
- `GET /v2/<name>/tags/list` — list tags

Push is not supported; images are pushed directly to GHCR via CI.

## Deployment

Deployed to Cloud Run (europe-west3) via kustomize manifests in `k8s/`.

```
bazel build //oci/cmd/registry/k8s
```

## Testing

```
bazel test //oci/pkg/proxy:proxy_test
```

## See also

- [archeio](https://github.com/kubernetes/registry.k8s.io/blob/main/cmd/archeio/README.md) — Kubernetes' registry.k8s.io proxy, similar architecture
- [OCI Distribution Spec](https://github.com/opencontainers/distribution-spec/blob/main/spec.md) — the spec this proxy implements (pull subset)
