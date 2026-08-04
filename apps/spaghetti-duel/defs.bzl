"""Identity constants for the spaghetti-duel deploy.

Same shape as `//apps/dino-meteor:defs.bzl` — the LB root reads `LB_BACKEND`
at Starlark evaluation time rather than through a `terraform_remote_state`
data source.
"""

load("@terraform.bzl", "ref")

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
    # The service this root creates, named by reference so the LB's deploy
    # edge and the value it routes to are the same token — they cannot come
    # to disagree. Published by this package's `tf_root` as an export.
    "service_name": ref("//apps/spaghetti-duel:terraform", "service_name"),
    "regions": [REGION],
    "host": "pasta.arquero.dev",
}
