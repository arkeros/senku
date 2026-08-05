"""Identity constants for the dino-meteor deploy.

Same shape as `//apps/napkin-battle:defs.bzl` — the LB root reads
`LB_BACKEND` at Starlark evaluation time rather than through a
`terraform_remote_state` data source.
"""

load("//devtools/build/tools/tf:bucket_push.bzl", "published_bucket")

PROJECT = "senku-prod"

# Bucket location, not a compute region — nothing runs here. The CDN edge
# that fronts this origin sits in Paris (Telefónica hands Google Cloud
# prefixes off there rather than inside Spain), so this is the region closest
# to the only client the bucket ever has: the load balancer on a cache miss.
# Measured, not assumed.
REGION = "europe-west1"

# Names the GAR repository and the bucket. Not a service — nothing runs;
# see CONTEXT.md, where "service" means a Cloud Run service and only that.
SITE_NAME = "dino-meteor"

# The origin. Bucket names are globally unique, so the project prefix is what
# keeps this one available.
#
# A literal rather than a `ref` because two things outside Terraform need to
# name this bucket before any state exists: `bucket_push`, which writes into
# it, and `site_gcs`, which creates it. The `ref` twin below is for the LB,
# which needs the deploy edge as well as the value.
BUCKET_NAME = "{}-{}".format(PROJECT, SITE_NAME)

# Its own host with no `paths`: an SPA that owns every path under the
# hostname. See //infra/cloud/gcp/lb for how this is consumed.
LB_BACKEND = {
    # A StaticSite realised by the `gcs-cdn` driver: the LB builds a
    # `google_compute_backend_bucket` rather than a serverless NEG. This app
    # was a StaticSite on a container driver before too — what changed is
    # the driver, and with it the instance that had to start first.
    "driver": "gcs-cdn",
    # Named by reference to the *push*, not to the root that creates the
    # bucket. Both would give the right string; only this one makes the
    # routing wait until there is something in the bucket to route to. The
    # value and the deploy edge are one token, so they cannot disagree.
    "bucket_name": published_bucket("//apps/dino-meteor:bucket_push"),
    "host": "dino.arquero.dev",
}
