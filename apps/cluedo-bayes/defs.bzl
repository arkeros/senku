"""Identity constants for the cluedo-bayes deploy."""

PROJECT = "senku-prod"

# Matches the other games; see //apps/dino-meteor:defs.bzl for why the origin
# sits near the Paris CDN edge rather than near Barcelona.
REGION = "europe-west1"

SERVICE_NAME = "cluedo-bayes"

LB_BACKEND = {
    "service_name": SERVICE_NAME,
    "regions": [REGION],
    "host": "cluedo.arquero.dev",
}
