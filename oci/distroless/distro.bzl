load("@rules_img//img:image.bzl", "image_index")
load("//oci/distroless/common:variables.bzl", "NONROOT")
load("//oci:oci_image.bzl", "oci_image")

VERSIONS = [
    # ("debian12", "bookworm", "12"),
    ("debian13", "trixie", "13"),
]

VARIANTS = {
    "arm": "v7",
    "arm64": "v8",
}

ARCHITECTURE_PLATFORMS = {
    "amd64": "//bazel/platforms:linux_amd64",
    "arm64": "//bazel/platforms:linux_arm64",
}

ALL_ARCHITECTURES = ["amd64", "arm64"]
ALL_DISTROS = ["debian13"]

USER_VARIANTS = [
    ("root", 0, "/"),
    ("nonroot", NONROOT, "/home/nonroot"),
]

def _render_string(value, substitutions):
    rendered = value
    for key, replacement in substitutions.items():
        rendered = rendered.replace("{" + key + "}", replacement)
    return rendered

def _render_value(value, substitutions):
    if value == None:
        return None

    value_type = type(value)
    if value_type == "string":
        return _render_string(value, substitutions)
    if value_type == "list":
        rendered = []
        for item in value:
            if type(item) == "string":
                rendered.append(_render_string(item, substitutions))
            else:
                rendered.append(item)
        return rendered
    if value_type == "dict":
        rendered = {}
        for key, item in value.items():
            if type(item) == "string":
                rendered[key] = _render_string(item, substitutions)
            else:
                rendered[key] = item
        return rendered

    return value

def _merge_dicts(base, overlay):
    merged = {}
    for source in [base, overlay]:
        if source:
            for key, value in source.items():
                merged[key] = value
    return merged

def _copy_dict(source):
    copied = {}
    for key, value in source.items():
        copied[key] = value
    return copied

def _image_name(name, mode, user, arch, distro):
    return "{}{}_{}_{}_{}".format(name, mode, user, arch, distro)

def _index_name(name, mode, user, distro):
    return "{}{}_{}_{}".format(name, mode, user, distro)

def _emit_image(
        name,
        arch,
        uid,
        working_dir,
        base,
        layers,
        entrypoint,
        env,
        annotations):
    kwargs = {
        "name": name,
        "layers": layers,
        "platform": ARCHITECTURE_PLATFORMS[arch],
        "user": "%d" % uid,
        "working_dir": working_dir,
    }

    if base != None:
        kwargs["base"] = base
    if entrypoint != None:
        kwargs["entrypoint"] = entrypoint
    if env:
        kwargs["env"] = env
    if annotations:
        kwargs["annotations"] = annotations

    oci_image(**kwargs)

def distroless_matrix(
        name,
        distro,
        architectures,
        layers,
        base = None,
        entrypoint = None,
        env = None,
        annotations = None,
        index_annotations = None,
        debug_base = None,
        debug_layers = None,
        debug_entrypoint = None,
        debug_env = None,
        debug_annotations = None,
        debug_index_annotations = None):
    """Generates release/debug OCI images plus per-user manifest indexes."""

    release_env = env or {}
    release_annotations = annotations or {}
    release_index_annotations = index_annotations if index_annotations != None else release_annotations

    effective_debug_layers = debug_layers if debug_layers != None else (layers if base != None else [])
    effective_debug_entrypoint = debug_entrypoint if debug_entrypoint != None else entrypoint
    effective_debug_env = _merge_dicts(release_env, debug_env or {})
    effective_debug_annotations = debug_annotations if debug_annotations != None else release_annotations
    effective_debug_index_annotations = debug_index_annotations if debug_index_annotations != None else release_index_annotations

    for arch in architectures:
        for (user, uid, working_dir) in USER_VARIANTS:
            release_name = _image_name(name, "", user, arch, distro)
            release_context = {
                "name": name,
                "mode": "",
                "user": user,
                "uid": "%d" % uid,
                "arch": arch,
                "distro": distro,
                "working_dir": working_dir,
                "release_name": release_name,
            }

            _emit_image(
                name = release_name,
                arch = arch,
                uid = uid,
                working_dir = working_dir,
                base = _render_value(base, release_context),
                layers = _render_value(layers, release_context),
                entrypoint = _render_value(entrypoint, release_context),
                env = _render_value(release_env, release_context),
                annotations = _render_value(release_annotations, release_context),
            )

            debug_name = _image_name(name, "_debug", user, arch, distro)
            debug_context = _copy_dict(release_context)
            debug_context["mode"] = "_debug"
            debug_context["debug_name"] = debug_name

            resolved_debug_base = _render_value(debug_base, debug_context)
            if resolved_debug_base == None:
                resolved_debug_base = _render_value(base, debug_context) if base != None else ":" + release_name

            _emit_image(
                name = debug_name,
                arch = arch,
                uid = uid,
                working_dir = working_dir,
                base = resolved_debug_base,
                layers = _render_value(effective_debug_layers, debug_context),
                entrypoint = _render_value(effective_debug_entrypoint, debug_context),
                env = _render_value(effective_debug_env, debug_context),
                annotations = _render_value(effective_debug_annotations, debug_context),
            )

    for (mode, mode_annotations) in [
        ("", release_index_annotations),
        ("_debug", effective_debug_index_annotations),
    ]:
        for (user, _, _) in USER_VARIANTS:
            image_index(
                name = _index_name(name, mode, user, distro),
                annotations = _render_value(mode_annotations, {
                    "name": name,
                    "mode": mode,
                    "user": user,
                    "distro": distro,
                }),
                manifests = [
                    _image_name(name, mode, user, arch, distro)
                    for arch in architectures
                ],
            )
