load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@bazel_skylib//rules:build_test.bzl", "build_test")
load("@terraform.bzl//:gcp.bzl", "google_provider")
load("@terraform.bzl", "output", "tf_root")
load("//devtools/bifrost/modules:staticsite.bzl", "site_gcs")
load("//devtools/build/react_component:react_app.bzl", "react_app", "route")
load("//devtools/build/react_component:react_static_layer.bzl", "react_static_layer")
load("//devtools/build/tools/tf:bucket_push.bzl", "bucket_push")
load("//devtools/build/tools/tf:render.bzl", "registry_push")
load("//infra/cloud/gcp/gar:defs.bzl", "REGISTRY")
load("//oci:frontend_image.bzl", "NGINX_FRONTEND_DEFAULT_CHANNEL", "frontend_images_all_arch")
load("//oci:vex.bzl", "vex_document")
load("//oci/distroless/common:hummingbird_fixed_vex.bzl", "NGINX_HUMMINGBIRD_FIXED_VEX_STATEMENTS")
load(
    ":defs.bzl",
    "BUCKET_NAME",
    "PROJECT",
    "REGION",
    "SITE_NAME",
)

# `jit_open_props` is off: this app draws to a canvas and its handful of DOM
# styles use literal values, so there are no Open Props custom properties to
# inject.
react_app(
    name = "app",
    browser_deps = [
        "//:browser_modules/_react",
        "//:browser_modules/react-router",
        "//:browser_modules/cookie",
        "//:browser_modules/set-cookie-parser",
        "//:browser_modules/@stylexjs/stylex",
        "//:browser_modules/messageformat",
        "//:browser_modules/@panellet/i18n-runtime",
    ],
    error_component = "//apps/spaghetti-duel/components/AppError",
    html_template = "index.html.tpl",
    layout = "//apps/spaghetti-duel/components/Layout",
    locales = [
        "ca",
        "en",
        "es",
    ],
    routes = [
        route(
            component = "//apps/spaghetti-duel/pages/Play",
            path = "/",
        ),
        route(
            component = "//apps/spaghetti-duel/pages/NotFound",
            path = "*",
        ),
    ],
    source_locale = "es",
    visibility = ["//visibility:private"],
)

build_test(
    name = "app_build_test",
    targets = [
        ":app",
        ":app_bundle",
        ":app_devserver",
        ":app_html",
        ":app_styles",
    ],
)

react_static_layer(
    name = "app_layer",
    app = ":app",
    # Named once: `:app_layer_extras` below is built from this same list,
    # so the icons cannot reach the image without also reaching the bucket.
    extra_srcs = ["//apps/spaghetti-duel/icons:icons"],
)

# Inherited from the nginx base: the nginx.org rpm this image serves
# from is flagged by a cross-vendor release-tag comparison against
# Hummingbird's own nginx rebuild. See
# //oci/distroless/common:hummingbird_fixed_vex.bzl.
vex_document(
    name = "vex",
    author = "rafael@arquero.cat",
    id = "https://github.com/arkeros/senku/blob/main/apps/spaghetti-duel/BUILD",
    statements = NGINX_HUMMINGBIRD_FIXED_VEX_STATEMENTS[NGINX_FRONTEND_DEFAULT_CHANNEL],
    timestamp = "2026-08-03T00:00:00Z",
)

frontend_images_all_arch(
    name = "image",
    distro = "hummingbird",
    statics_layer = [
        ":app_layer_statics",
        ":app_layer_conf",
        ":app_layer_extras",
    ],
    vex = [":vex"],
)

registry_push(
    name = "image_push_gar",
    image = ":image",
    registry = REGISTRY,
    repository = SITE_NAME,
)

# The origin. No service account: nothing runs, so there is no identity for
# anything to run as. The bucket is read anonymously by the LB — see
# `site_gcs` for why that grant is the only way a backend bucket works.
pasta_site = site_gcs(
    name = "spaghetti_duel",
    bucket_name = BUCKET_NAME,
    location = REGION,
    project = PROJECT,
)

tf_root(
    name = "terraform",
    backend_bucket = "senku-prod-terraform-state",
    docs = [
        google_provider(project = PROJECT),
        pasta_site,
        output(
            "bucket_url",
            description = "`gs://` URL of the origin. Not how the site is served (that is the LB); exposed for `gcloud storage` inspection.",
            value = pasta_site.url,
        ),
    ],
    providers = ["@terraform_providers//:google"],
    visibility = ["//visibility:public"],
)

# The bucket's contents, which Terraform does not manage — see
# `bucket_push.bzl`. `after` is this package's own root because that root is
# what creates the bucket being written into.
bucket_push(
    name = "bucket_push",
    after = [":terraform"],
    bucket = BUCKET_NAME,
    cache_rules = ":app_layer_cache_rules",
    # The LB resolves `published_bucket()` against this node.
    visibility = ["//visibility:public"],
    webroot = ":app_layer_webroot",
)

bzl_library(
    name = "defs",
    srcs = ["defs.bzl"],
    visibility = ["//visibility:public"],
    deps = ["//devtools/build/tools/tf:bucket_push"],  # keep (consumed via load() in //infra/cloud/gcp/lb:defs.bzl — gazelle's bzl_library reverse-dep detection only reads BUILD files, not other .bzl, so without this the rule gets regenerated and visibility stripped)
)
