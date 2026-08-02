"""Identity constants for the table-for-two deploy.

Same shape as the other two games — the LB root reads `LB_BACKEND` at
Starlark evaluation time rather than through `terraform_remote_state`.
"""

PROJECT = "senku-prod"

# Matches the other games. The CDN edge serving Catalonia is in Paris (see
# //apps/dino-meteor:defs.bzl), so europe-west1 is the closest origin to the
# edge, not Madrid.
REGION = "europe-west1"

SERVICE_NAME = "table-for-two"

# Its own host with no `paths`: an SPA owning every path under the hostname.
LB_BACKEND = {
    "service_name": SERVICE_NAME,
    "regions": [REGION],
    "host": "mesa.arquero.dev",
}
