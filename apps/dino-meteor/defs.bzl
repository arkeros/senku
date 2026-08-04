"""Identity constants for the dino-meteor deploy.

Same shape as `//apps/napkin-battle:defs.bzl` — the LB root reads
`LB_BACKEND` at Starlark evaluation time rather than through a
`terraform_remote_state` data source.
"""

PROJECT = "senku-prod"

# Matches napkin-battle. The CDN edge that actually talks to this origin sits
# in Paris (Telefónica hands Google Cloud prefixes off there rather than
# inside Spain), so a Madrid region would be further from the edge, not
# closer — measured, not assumed.
REGION = "europe-west1"

SERVICE_NAME = "dino-meteor"

# Its own host with no `paths`: an SPA that owns every path under the
# hostname. See //infra/cloud/gcp/lb for how this is consumed.
LB_BACKEND = {
    "service_name": SERVICE_NAME,
    # The root that creates the Cloud Run service named above. The LB
    # turns this into a deploy edge, so a backend is always running
    # before anything routes to it.
    "root": "//apps/dino-meteor:terraform",
    "regions": [REGION],
    "host": "dino.arquero.dev",
}
