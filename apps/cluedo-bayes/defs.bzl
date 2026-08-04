"""Identity constants for the cluedo-bayes deploy."""

PROJECT = "senku-prod"

# Matches the other games; see //apps/dino-meteor:defs.bzl for why the origin
# sits near the Paris CDN edge rather than near Barcelona.
REGION = "europe-west1"

SERVICE_NAME = "cluedo-bayes"

LB_BACKEND = {
    "service_name": SERVICE_NAME,
    # The root that creates the Cloud Run service named above. The LB
    # turns this into a deploy edge, so a backend is always running
    # before anything routes to it.
    "root": "//apps/cluedo-bayes:terraform",
    "regions": [REGION],
    "host": "cluedo.arquero.dev",
}
