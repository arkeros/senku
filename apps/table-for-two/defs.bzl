"""Identity constants for the table-for-two deploy.

Same shape as the other two games — the LB root reads `LB_BACKEND` at
Starlark evaluation time rather than through `terraform_remote_state`.
"""

load("//devtools/build/tools/tf:bucket_push.bzl", "published_bucket")

PROJECT = "senku-prod"

# Matches the other games. The CDN edge serving Catalonia is in Paris (see
# //apps/dino-meteor:defs.bzl), so europe-west1 is the closest origin to the
# edge, not Madrid.
REGION = "europe-west1"

# Names the GAR repository and the bucket. Not a service — nothing runs;
# see CONTEXT.md, where "service" means a Cloud Run service and only that.
SITE_NAME = "table-for-two"

# The origin. Bucket names are globally unique, so the project prefix is what
# keeps this one available. A literal rather than a `ref` for the reason given
# in //apps/dino-meteor:defs.bzl.
BUCKET_NAME = "{}-{}".format(PROJECT, SITE_NAME)

# Its own host with no `paths`: an SPA owning every path under the hostname.
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
    "bucket_name": published_bucket("//apps/table-for-two:bucket_push"),
    "host": "mesa.arquero.dev",
}
