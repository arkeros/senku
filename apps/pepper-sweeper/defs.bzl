"""Identity constants for the pepper-sweeper deploy.

Same shape as `//apps/spaghetti-duel:defs.bzl` — the LB root reads
`LB_BACKEND` at Starlark evaluation time rather than through a
`terraform_remote_state` data source.
"""

load("@terraform.bzl", "ref")

PROJECT = "senku-prod"

# Matches the other panellet apps. The CDN edge that actually talks to this
# origin sits in Paris (Telefónica hands Google Cloud prefixes off there
# rather than inside Spain), so a Madrid region would be further from the
# edge, not closer — measured, not assumed.
REGION = "europe-west1"

SERVICE_NAME = "pepper-sweeper"

# Its own host with no `paths`: an SPA that owns every path under the
# hostname. See //infra/cloud/gcp/lb for how this is consumed.
LB_BACKEND = {
    # The service this root creates, named by reference so the LB's deploy
    # edge and the value it routes to are the same token — they cannot come
    # to disagree. Published by this package's `tf_root` as an export.
    #
    # No literal twin like //oci/cmd/registry's `LB_BACKEND_TF`: that root
    # publishes an `lb_backends` output, so it needs a copy of this fact it can
    # put in its *own* document, where a self-reference would not resolve. This
    # root publishes no such output — the sentinel only ever lands in the LB
    # root's NEGs.
    "service_name": ref("//apps/pepper-sweeper:terraform", "service_name"),
    "regions": [REGION],
    "host": "padron.arquero.dev",
}
