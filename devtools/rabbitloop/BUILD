# gazelle:python_library_naming_convention $package_name$_lib
load("@aspect_rules_py//py:defs.bzl", "py_binary", "py_library", "py_test")

py_binary(
    name = "rabbitloop",
    srcs = ["main.py"],
    visibility = ["//devtools:__subpackages__"],
    deps = [
        ":rabbitloop_lib",
        "@pip//absl_py",
    ],
)

py_test(
    name = "github_test",
    srcs = ["github_test.py"],
    deps = [
        ":rabbitloop_lib",
        "@pip//requests",
    ],
)

py_test(
    name = "claude_test",
    srcs = ["claude_test.py"],
    deps = [":rabbitloop_lib"],
)

py_test(
    name = "main_test",
    srcs = ["main_test.py"],
    deps = [":rabbitloop_lib"],
)

py_library(
    name = "rabbitloop_lib",
    srcs = [
        "__init__.py",
        "claude.py",
        "detect.py",
        "github.py",
        "main.py",
    ],
    visibility = ["//:__subpackages__"],
    deps = [
        "@pip//absl_py",
        "@pip//requests",
    ],
)

py_test(
    name = "detect_test",
    srcs = ["detect_test.py"],
    deps = [":rabbitloop_lib"],
)
