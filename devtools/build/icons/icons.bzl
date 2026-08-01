"""Home-screen and browser icons, rasterized from one SVG at build time.

`app_icons` takes a single square SVG and emits the file set a browser and an
iOS home screen actually ask for, plus a web app manifest and a tar layer that
drops them at the webroot paths those references point at.

Nothing binary is checked in: the SVG is the source of truth and the PNGs are
build outputs, which is the whole reason this is a rule rather than a folder of
exported images.
"""

load("@aspect_rules_js//js:defs.bzl", "js_run_binary")
load("@bazel_skylib//rules:write_file.bzl", "write_file")
load("@tar.bzl", "mutate", "tar")
load("//oci:frontend_image.bzl", "NGINX_UID", "NGINX_USERNAME", "NGINX_WEB_ROOT")

# What each emitted PNG is for:
#
#   180  apple-touch-icon. The size iOS wants for a home-screen shortcut on a
#        modern iPhone; it downscales for older ones.
#   192  the smaller web app manifest icon (Android launcher).
#   512  the larger manifest icon, also used for splash generation.
#    32  a favicon fallback for browsers that ignore the SVG one.
_SIZES = {
    "apple-touch-icon.png": 180,
    "icon-192.png": 192,
    "icon-512.png": 512,
    "favicon-32.png": 32,
}

def app_icons(
        name,
        svg,
        app_name,
        short_name,
        theme_color,
        background_color,
        start_url = "/",
        visibility = None):
    """Rasterize `svg` and package the icon set for one app.

    Emits:
      :{name}                   filegroup of every generated file
      :{name}_layer             tar mounting them at the nginx webroot
      :{name}_manifest          the .webmanifest
      plus one target per size in `_SIZES`

    Pass `:{name}_layer` to `frontend_image`'s `statics_layer` alongside the
    app's own layers. It is a separate layer on purpose: icons change on a
    redesign, the bundle changes on every commit, and they should not share a
    cache boundary.

    Args:
        name: target name prefix.
        svg: square source SVG. Must not contain `<text>` — see rasterize.mjs.
        app_name: full name, shown on the manifest install prompt.
        short_name: name under the home-screen icon. Keep it under ~12
            characters or iOS truncates it with an ellipsis.
        theme_color: browser UI colour once installed.
        background_color: splash-screen colour before first paint.
        start_url: what launching the icon opens.
        visibility: Bazel visibility.
    """
    outs = []

    for filename, size in _SIZES.items():
        target = "{}_{}".format(name, filename.replace(".", "_").replace("-", "_"))
        js_run_binary(
            name = target,
            srcs = [svg],
            outs = [filename],
            args = [
                "--svg",
                "$(location {})".format(svg),
                "--out",
                "$(location {})".format(filename),
                "--size",
                str(size),
            ],
            tool = Label("//devtools/build/icons:rasterize_bin"),
            visibility = visibility,
        )
        outs.append(":" + target)

    # /favicon.ico is generated from the 32px PNG rather than rendered again.
    # Deliberately not referenced from the HTML — browsers use the SVG or PNG
    # from their link tags. It is there for clients that hardcode the path.
    ico = name + "_favicon_ico"
    js_run_binary(
        name = ico,
        srcs = [":{}_favicon_32_png".format(name)],
        outs = ["favicon.ico"],
        args = [
            "--png",
            "$(location :{}_favicon_32_png)".format(name),
            "--out",
            "$(location favicon.ico)",
        ],
        tool = Label("//devtools/build/icons:png_to_ico_bin"),
        visibility = visibility,
    )
    outs.append(":" + ico)

    # The SVG ships as-is too: browsers that support it get a favicon that
    # stays sharp at any size, and it costs a few hundred bytes.
    svg_copy = name + "_favicon_svg"
    native.genrule(
        name = svg_copy,
        srcs = [svg],
        outs = ["favicon.svg"],
        cmd = "cp $< $@",
        visibility = visibility,
    )
    outs.append(":" + svg_copy)

    manifest = name + "_manifest"
    write_file(
        name = manifest,
        out = "manifest.webmanifest",
        content = [json.encode_indent({
            "name": app_name,
            "short_name": short_name,
            "start_url": start_url,
            # `standalone` is what drops the Safari chrome once launched from
            # the home screen — the point of the exercise.
            "display": "standalone",
            "orientation": "portrait",
            "theme_color": theme_color,
            "background_color": background_color,
            "icons": [
                {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
                {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
                {
                    "src": "/icon-512.png",
                    "sizes": "512x512",
                    "type": "image/png",
                    # Android crops maskable icons to its own shape. The art is
                    # full-bleed with its subject centred, so it survives that.
                    "purpose": "maskable",
                },
            ],
        }, indent = "  "), ""],
        visibility = visibility,
    )
    outs.append(":" + manifest)

    native.filegroup(
        name = name,
        srcs = outs,
        visibility = visibility,
    )

    # These land at the webroot root, because index.html.tpl references them by
    # absolute path and a static template cannot know a content-hashed URL.
    #
    # `strip_prefix` is the calling package as-is. `app_icons` is invoked from
    # the app's `icons/BUILD`, so `package_name()` already ends in `/icons`;
    # appending it again silently strips nothing, and every file lands one
    # directory deep where nginx answers with the SPA fallback instead.
    tar(
        name = name + "_layer",
        srcs = outs,
        mutate = mutate(
            owner = str(NGINX_UID),
            ownername = NGINX_USERNAME,
            package_dir = NGINX_WEB_ROOT,
            strip_prefix = native.package_name(),
        ),
        visibility = visibility,
    )
