"""Identity constants for the cluedo-bayes deploy."""

load("@terraform.bzl", "ref")

PROJECT = "senku-prod"

# Matches the other games; see //apps/dino-meteor:defs.bzl for why the origin
# sits near the Paris CDN edge rather than near Barcelona.
REGION = "europe-west1"

SERVICE_NAME = "cluedo-bayes"

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
    "service_name": ref("//apps/cluedo-bayes:terraform", "service_name"),
    "regions": [REGION],
    "host": "cluedo.arquero.dev",
}
