"""Identity constants for the spaghetti-duel deploy.

Same shape as `//apps/dino-meteor:defs.bzl` — the LB root reads `LB_BACKEND`
at Starlark evaluation time rather than through a `terraform_remote_state`
data source.
"""

PROJECT = "senku-prod"

# Matches the other panellet apps. The CDN edge that actually talks to this
# origin sits in Paris (Telefónica hands Google Cloud prefixes off there
# rather than inside Spain), so a Madrid region would be further from the
# edge, not closer — measured, not assumed.
REGION = "europe-west1"

SERVICE_NAME = "spaghetti-duel"

# Its own host with no `paths`: an SPA that owns every path under the
# hostname. See //infra/cloud/gcp/lb for how this is consumed.
LB_BACKEND = {
    "service_name": SERVICE_NAME,
    # The root that creates the Cloud Run service named above. The LB
    # turns this into a deploy edge, so a backend is always running
    # before anything routes to it.
    "root": "//apps/spaghetti-duel:terraform",
    "regions": [REGION],
    "host": "pasta.arquero.dev",
}
