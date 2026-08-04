"""Identity constants for the napkin-battle deploy.

Kept in a `.bzl` next to the app (the same shape as
`//oci/cmd/registry:defs.bzl`) so the LB root can read `LB_BACKEND` at
Starlark evaluation time instead of through a `terraform_remote_state`
data source.
"""

PROJECT = "senku-prod"

# One region. This is a static napkin behind a CDN-enabled LB — regional
# fan-out would buy a few milliseconds on cache misses and cost three times
# the Cloud Run surface to reason about. EU because the players are here.
REGION = "europe-west1"

SERVICE_NAME = "napkin-battle"

# Consumed by //infra/cloud/gcp/lb, which turns this into a serverless NEG, a
# backend service, a managed certificate and a host rule.
#
# Its own `host` with no `paths`, which together mean "this backend owns every
# path on that hostname". Both halves are load-bearing: the game is an SPA
# serving absolute URLs (`/app_bundle/…`, `/app_styles.css`) and rendering its
# own 404 for unknown paths, so it can't be hung off a path prefix under the
# primary domain without teaching react_app a base path.
LB_BACKEND = {
    "service_name": SERVICE_NAME,
    # The root that creates the Cloud Run service named above. The LB
    # turns this into a deploy edge, so a backend is always running
    # before anything routes to it.
    "root": "//apps/napkin-battle:terraform",
    "regions": [REGION],
    "host": "napkin.arquero.dev",
}
