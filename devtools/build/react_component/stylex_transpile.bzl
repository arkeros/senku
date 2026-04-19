"Shared transpiler adapter used by ts_project for StyleX-aware TS compilation"

load("@aspect_rules_js//js:defs.bzl", "js_run_binary")
load("@bazel_lib//lib:copy_file.bzl", "copy_file")
load("@bazel_lib//lib:copy_to_bin.bzl", "copy_to_bin")

def stylex_transpile(name, srcs, out_dir = None, resolve_json = False, stylex_deps = [], **kwargs):
    """Run @babel/core with the StyleX plugin to emit .js + .js.map + .stylex.json.

    Designed to be plugged into ts_project's `transpiler` attribute. Emits a
    filegroup at `name` with JS outputs and another at `name + "_stylex_metadata"`
    with .stylex.json metadata used by stylex_css for CSS collection.

    Args:
        name: filegroup name (set by ts_project — usually `<target>_transpile`)
        srcs: source files handed to the transpiler by ts_project
        out_dir: optional output subdirectory (passed by ts_project)
        resolve_json: whether to pass .json sources through unchanged
        stylex_deps: extra labels whose outputs must be available when Babel
            resolves `defineVars` imports across targets
        **kwargs: forwarded to the inner js_run_binary (e.g. tags, visibility)
    """
    outs = []
    metadata_outs = []

    for idx, src in enumerate(srcs):
        # Copy JSON files through without transpilation
        if resolve_json and src.endswith(".json"):
            if out_dir:
                copy_file(
                    name = "{}_{}".format(name, idx),
                    src = src,
                    out = "%s/%s" % (out_dir, src),
                )
            else:
                copy_to_bin(
                    name = "{}_{}".format(name, idx),
                    srcs = [src],
                )
            outs.append(":{}_{}".format(name, idx))
            continue

        # Skip declaration files — tsc handles those
        if src.endswith(".d.ts") or src.endswith(".d.mts"):
            continue

        if not (src.endswith(".ts") or src.endswith(".tsx") or src.endswith(".mts")):
            fail("stylex_transpile supports .[m]ts, .tsx, or .json files, found: %s" % src)

        out_pre = "%s/" % out_dir if out_dir else ""

        # Predict output paths
        js_out = out_pre + src.replace(".mts", ".mjs").replace(".tsx", ".js").replace(".ts", ".js")
        map_out = js_out + ".map"
        metadata_out = out_pre + src.replace(".mts", ".mjs.stylex.json").replace(".tsx", ".stylex.json").replace(".ts", ".stylex.json")

        args = [
            "$(location {})".format(src),
            "--out-file",
            "$(location {})".format(js_out),
            "--metadata-file",
            "$(location {})".format(metadata_out),
        ]

        # Include dep outputs so the StyleX Babel plugin can resolve defineVars
        # imports (e.g. ./tokens.stylex) across targets
        tool_srcs = [
            src,
        ] + stylex_deps + [
            "//:node_modules/@babel/core",
            "//:node_modules/@babel/preset-typescript",
            "//:node_modules/@babel/preset-react",
            "//:node_modules/@stylexjs/babel-plugin",
        ]

        js_run_binary(
            name = "{}_{}".format(name, idx),
            srcs = tool_srcs,
            outs = [js_out, map_out, metadata_out],
            args = args,
            tool = Label("//devtools/build/react_component:stylex_transpile_bin"),
            **kwargs
        )

        outs.append(js_out)
        outs.append(map_out)
        metadata_outs.append(metadata_out)

    # The filegroup that ts_project() references for JS outputs
    native.filegroup(
        name = name,
        srcs = outs,
    )

    # Metadata filegroup for CSS collection
    native.filegroup(
        name = name + "_stylex_metadata",
        srcs = metadata_outs,
    )
