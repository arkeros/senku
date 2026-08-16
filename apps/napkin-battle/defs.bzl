"""Identity constants for the napkin-battle deploy.

Kept in a `.bzl` next to the app (the same shape as
`//oci/cmd/registry:defs.bzl`) so the LB root can read `LB_BACKEND` at
Starlark evaluation time instead of through a `terraform_remote_state`
data source.
"""

load("//devtools/build/tools/tf:bucket_push.bzl", "published_bucket")

PROJECT = "senku-prod"

# Bucket location, not a compute region — nothing runs here. One location is
# all a bucket origin has: the CDN is what puts the napkin near a player, and
# this only has to be near the edge that fills the cache. EU because the
# players are here.
REGION = "europe-west1"

# Names the GAR repository and the bucket. Not a service — nothing runs;
# see CONTEXT.md, where "service" means a Cloud Run service and only that.
SITE_NAME = "napkin-battle"

# The origin. Bucket names are globally unique, so the project prefix is what
# keeps this one available. A literal rather than a `ref` for the reason given
# in //apps/dino-meteor:defs.bzl.
BUCKET_NAME = "{}-{}".format(PROJECT, SITE_NAME)

# Consumed by //infra/cloud/gcp/lb, which turns this into a backend bucket, a
# managed certificate and a host rule.
#
# Its own `host` with no `paths`, which together mean "this backend owns every
# path on that hostname". Both halves are load-bearing: the game is an SPA
# serving absolute URLs (`/app_bundle/…`, `/app_styles.css`) and rendering its
# own 404 for unknown paths, so it can't be hung off a path prefix under the
# primary domain without teaching react_app a base path.
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
    "bucket_name": published_bucket("//apps/napkin-battle:bucket_push"),
    "host": "napkin.arquero.dev",
}
