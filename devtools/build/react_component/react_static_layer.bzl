"""Build a tar layer from a react_app's outputs, ready for nginx at /var/www/html."""

load("@bazel_lib//lib:copy_to_directory.bzl", "copy_to_directory")
load("@bazel_lib//lib:expand_template.bzl", "expand_template")
load("@bazel_skylib//rules:write_file.bzl", "write_file")
load("@tar.bzl", "mutate", "tar")
load("//oci:frontend_image.bzl", "NGINX_UID", "NGINX_USERNAME", "NGINX_WEB_ROOT")
load(":cache.bzl", "cache_rules_json", "cache_rules_nginx", "webroot_cache_rules")

def react_static_layer(
        name,
        app,
        extra_srcs = None,
        **kwargs):
    """Build the tar layers for shipping a react_app under nginx.

    react_app's HTML references `/{app}_bundle/{app}_main.js` and hashed
    assets under `/assets/`. Nginx serves `/var/www/html` with
    `try_files $uri $uri/ /index.html`, so the webroot tar's entries sit at
    those exact absolute paths. The stylesheets are not among them — they
    are inlined into the documents, so there is no CSS URL to serve.

    Also produces a per-app `default.conf` that replaces the base nginx
    image's generic one — it knows which URL prefixes this app
    content-addresses (the esbuild bundle dir's chunks) and can mark
    them immutable while leaving the unhashed entry revalidatable.

    Emits two tars (py_image_layer pattern: one layer per logical group,
    each with its own cache-invalidation boundary):

      :{name}_statics — /var/www/html/*       (webroot content)
      :{name}_conf    — /etc/nginx/conf.d/default.conf

    Pass both to `frontend_image`'s `statics_layer` as a list:

        frontend_images_all_arch(
            name = "image",
            statics_layer = [":app_layer_statics", ":app_layer_conf"],
        )

    Plus two targets for the bucket origin, which serves the same bytes with
    no nginx to interpret them:

      :{name}_webroot     — one directory holding everything a client can
                            request, `extra_srcs` included. The image splits
                            the same content across layers to keep cache
                            boundaries apart; a bucket has no layers, so it
                            wants the union.
      :{name}_cache_rules — the app's cache policy as JSON, for
                            `//devtools/build/tools/webroot` to stamp onto
                            each object. Rendered from the same
                            `webroot_cache_rules` list as the nginx conf.

    Args:
        name: prefix for emitted tar targets.
        app: label of a react_app in the same package (e.g. `":app"`).
            react_app emits a filegroup at `:{app_name}` aggregating the
            deployable outputs; this macro consumes that filegroup and
            derives rename rules from the app's name.
        extra_srcs: labels whose files are served from the webroot but want
            their own image layer — `app_icons`' output is the case this
            exists for, since icons change on a redesign and the bundle
            changes every commit. They are assembled once and reach both
            consumers from that one tree: `:{name}_extras` for the image,
            `:{name}_webroot` for the bucket. Pass `:{name}_extras` to
            `frontend_image`'s `statics_layer` rather than naming the same
            labels there a second time. Each label's package is stripped, so
            its files land at the webroot root.
        **kwargs: forwarded to each tar (visibility, tags, testonly).
    """
    app_label = native.package_relative_label(app)
    if app_label.package != native.package_name():
        fail(
            ("react_static_layer: app %r must be in the same package as " +
             "this target (got package %r, expected %r). The rename rules " +
             "derived from the app's name only make sense within one package.") %
            (app, app_label.package, native.package_name()),
        )
    app_name = app_label.name

    existing = native.existing_rules()
    if app_name not in existing:
        fail(
            ("react_static_layer: no react_app named %r in //%s. " +
             "Declare `react_app(name = %r, ...)` above this call.") %
            (app_name, native.package_name(), app_name),
        )

    # runtime_config ships a `/env.js` bootstrap that must be populated at
    # container-start via envsubst on env.js.tpl. The current nginx base
    # has no such startup hook, so shipping the image as-is would 404 on
    # /env.js and crash before first render — fail explicitly until
    # react_static_layer learns to stage env.js.
    if (app_name + "_env_tpl") in existing:
        fail(
            ("react_static_layer: react_app %r uses runtime_config, which " +
             "requires staging env.js.tpl + envsubst-at-container-start. " +
             "That wiring is not implemented yet — drop runtime_config " +
             "for now, or extend react_static_layer to cover it.") % app_name,
        )

    # Per-app nginx config. Carves out this app's esbuild bundle dir as
    # an immutable-cache prefix, with the unhashed JS entry explicitly
    # overridden back to `no-cache` so deploys are picked up. Everything
    # else (HTML, StyleX CSS, normalize) revalidates via ETag.
    #
    # Named `_default_conf` because it ships at /etc/nginx/conf.d/default.conf
    # — replacing the base nginx image's default.conf with this per-app one.
    # Output at `<target>/default.conf` so the final basename matches what
    # nginx expects; the tar's `strip_prefix` then drops the `<target>/`
    # wrapper, landing the file at /etc/nginx/conf.d/default.conf.
    rules = webroot_cache_rules(app_name)

    conf_name = name + "_default_conf"
    expand_template(
        name = conf_name,
        out = conf_name + "/default.conf",
        substitutions = {
            # `expand_template` runs "Make" variable expansion over
            # substitution values, and the extension rules render as regexes
            # anchored with `$`. Doubling it is how that attribute spells a
            # literal dollar sign; the rendered conf gets a single one.
            "{{CACHE_LOCATIONS}}": cache_rules_nginx(rules).replace("$", "$$"),
            "{{DEFAULT_CACHE_CONTROL}}": rules.default,
        },
        template = Label("//devtools/build/react_component:default.conf.tpl"),
    )

    # The same policy the conf above renders, in the form the bucket
    # uploader reads. Both come from `rules`, so there is one list to edit
    # and no way for the two origins to disagree about a path.
    write_file(
        name = name + "_cache_rules",
        out = name + "_cache_rules.json",
        content = [cache_rules_json(rules)],
        **kwargs
    )

    # Statics tree — the web content. Unchanged shape from the original
    # single-tar version: files land at basenames like `index.html` and
    # `assets/…`, then the tar's `package_dir` mounts them under
    # /var/www/html.
    statics_tree = name + "_statics_tree"
    copy_to_directory(
        name = statics_tree,
        srcs = [app],
        root_paths = ["."],
        # Sourcemaps stay as build artifacts (useful for error reporting
        # pipelines that ingest them out-of-band), but never land in the
        # image. Shipping .map in prod leaks unminified source and bloats
        # the layer for no end-user benefit.
        exclude_srcs_patterns = ["**/*.map"],
        replace_prefixes = {
            app_name + "_index.html": "index.html",
            app_name + "_assets_flat": "assets",
        },
    )

    # `extra_srcs`, assembled once. Each extra label's own package is added
    # to `root_paths` so its files land at the webroot root — the same place
    # a per-package tar would mount them with
    # `strip_prefix = package_name()`.
    #
    # Both consumers below read this one tree: the image's extras layer tars
    # it, the webroot copies it in. That is the point of assembling it here
    # rather than letting each side name the same labels — a file added to
    # `extra_srcs` reaches the image and the bucket together or not at all.
    # Naming them twice is how the bucket ends up serving something the
    # signed image does not contain, with nothing to say so.
    extras_tree = name + "_extras_tree"
    if extra_srcs:
        copy_to_directory(
            name = extras_tree,
            srcs = extra_srcs,
            root_paths = [
                native.package_relative_label(s).package
                for s in extra_srcs
            ],
            exclude_srcs_patterns = ["**/*.map"],
        )

        tar(
            name = name + "_extras",
            srcs = [":" + extras_tree],
            mutate = mutate(
                owner = str(NGINX_UID),
                ownername = NGINX_USERNAME,
                package_dir = NGINX_WEB_ROOT,
                strip_prefix = native.package_name() + "/" + extras_tree,
            ),
            **kwargs
        )

    # The bucket's view of the same site: one directory, the extras folded
    # in.
    copy_to_directory(
        name = name + "_webroot",
        srcs = [app] + ([":" + extras_tree] if extra_srcs else []),
        root_paths = ["."] + (
            [native.package_name() + "/" + extras_tree] if extra_srcs else []
        ),
        exclude_srcs_patterns = ["**/*.map"],
        replace_prefixes = {
            app_name + "_index.html": "index.html",
            app_name + "_assets_flat": "assets",
        },
        **kwargs
    )

    # Two tar layers, mirroring py_image_layer's "one layer per logical
    # group" pattern: the webroot and the nginx conf live in separate
    # tars, composed by the consumer passing both to `statics_layer` as
    # a list. Keeps caching boundaries clean — a config tweak doesn't
    # invalidate the statics layer and vice versa.
    tar(
        name = name + "_statics",
        srcs = [":" + statics_tree],
        mutate = mutate(
            owner = str(NGINX_UID),
            ownername = NGINX_USERNAME,
            package_dir = NGINX_WEB_ROOT,
            strip_prefix = native.package_name() + "/" + statics_tree,
        ),
        **kwargs
    )

    tar(
        name = name + "_conf",
        srcs = [":" + conf_name],
        mutate = mutate(
            owner = str(NGINX_UID),
            ownername = NGINX_USERNAME,
            package_dir = "/etc/nginx/conf.d",
            strip_prefix = native.package_name() + "/" + conf_name,
        ),
        **kwargs
    )
