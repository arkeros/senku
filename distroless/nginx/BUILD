load("@bazel_skylib//:bzl_library.bzl", "bzl_library")
load("@container_structure_test//:defs.bzl", "container_structure_test")
load("@rules_distroless//distroless:defs.bzl", "flatten")
load("@rules_img//img:push.bzl", "image_push")
load("@tar.bzl", "tar")
load("//distroless/common:variables.bzl", "DEBUG_MODE")
load("//oci:config.bzl", "OCI_REGISTRY", "OCI_REPOSITORY_PREFIX")
load(":config.bzl", "NGINX_ARCHITECTURES", "NGINX_DISTROS", "NGINX_TAGS", "NGINX_VERSIONS")
load(":nginx.bzl", "nginx_image", "nginx_image_index")

# CVE-2022-4899: libzstd, disputed - fixed in 2022 (https://github.com/facebook/zstd/issues/3200)
# CVE-2026-1642: nginx stable, fix only in mainline 1.29.5+
NGINX_IGNORE_CVES = [
    "CVE-2022-4899",
    "CVE-2026-1642",
]

package(default_visibility = ["//visibility:public"])

tar(
    name = "nginx_conf_layer",
    srcs = [
        "default.conf",
        "nginx.conf",
    ],
    mtree = [
        "./etc/nginx/nginx.conf uid=0 gid=0 mode=0644 type=file content=distroless/nginx/nginx.conf",
        "./etc/nginx/conf.d type=dir uid=0 gid=0 mode=0755",
        "./etc/nginx/conf.d/default.conf uid=0 gid=0 mode=0644 type=file content=distroless/nginx/default.conf",
        "./var/www/html type=dir uid=0 gid=0 mode=0755",
    ],
)

[
    flatten(
        name = version_label + "_" + arch + "_" + distro + "_layer",
        deduplicate = True,
        tars = [
            "@{}//{}/{}".format(apt_repo, "nginx", arch),
        ],
    )
    for version_label, apt_repo in NGINX_VERSIONS.items()
    for distro in NGINX_DISTROS
    for arch in NGINX_ARCHITECTURES[distro]
]

[
    nginx_image(
        name = "nginx",
        arch = arch,
        distro = distro,
        ignore_cves = NGINX_IGNORE_CVES,
        version_label = version_label,
    )
    for version_label in NGINX_VERSIONS
    for distro in NGINX_DISTROS
    for arch in NGINX_ARCHITECTURES[distro]
]

[
    nginx_image_index(
        name = "nginx",
        architectures = NGINX_ARCHITECTURES[distro],
        distro = distro,
        version_label = version_label,
    )
    for version_label in NGINX_VERSIONS
    for distro in NGINX_DISTROS
]

[
    image_push(
        name = "nginx_" + version_label + mode + "_push",
        image = ":nginx_" + version_label + mode + "_nonroot_debian13",
        registry = OCI_REGISTRY,
        repository = OCI_REPOSITORY_PREFIX + "/nginx",
        stamp = "enabled",
        tag_list = [
            version_label + ("-debug" if mode else ""),
            short_version + ("-debug" if mode else ""),
        ] + ([
            "debug" if mode else "latest",
        ] if version_label == "mainline" else []),
        tags = ["manual"],
    )
    for version_label, short_version in NGINX_TAGS.items()
    for mode in DEBUG_MODE
]

container_structure_test(
    name = "nginx_stable_test",
    size = "small",
    configs = ["test.yaml"],
    driver = "docker",
    image = ":nginx_stable_nonroot_amd64_debian13.oci_layout",
    tags = ["requires-docker"],
)

container_structure_test(
    name = "nginx_mainline_test",
    size = "small",
    configs = ["test.yaml"],
    driver = "docker",
    image = ":nginx_mainline_nonroot_amd64_debian13.oci_layout",
    tags = ["requires-docker"],
)

bzl_library(
    name = "nginx",
    srcs = ["nginx.bzl"],
    deps = [
        "//distroless:distro",
        "//distroless/common:variables",
        "//oci",
        "@container_structure_test//:defs",
        "@rules_img//img:image",
    ],
)

bzl_library(
    name = "frontend",
    srcs = ["frontend.bzl"],
    deps = [
        ":config",
        "//distroless:distro",
        "//distroless/common:variables",
        "//oci",
        "@rules_img//img:image",
    ],
)

bzl_library(
    name = "config",
    srcs = ["config.bzl"],
)
