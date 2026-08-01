load("//devtools/build/react_component:react_component.bzl", "react_component")

react_component(
    name = "Notepad",
    srcs = ["Notepad.tsx"],
    visibility = ["//apps/cluedo-bayes:__subpackages__"],
    deps = [
        "//apps/cluedo-bayes/game:cards",
        "//apps/cluedo-bayes/game:solver",
        "//apps/cluedo-bayes/ui/theme:tokens",
    ],
)
