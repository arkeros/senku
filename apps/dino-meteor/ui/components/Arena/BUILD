load("//devtools/build/react_component:react_component.bzl", "react_component")

# The only stateful component: owns the canvas, the requestAnimationFrame
# loop and the pointer handlers. Deliberately holds its world in a closure
# rather than React state — a 60fps re-render would be absurd — so the effect
# mounts once and reads changing props through a ref.
react_component(
    name = "Arena",
    srcs = ["Arena.tsx"],
    visibility = ["//apps/dino-meteor:__subpackages__"],
    deps = [
        "//apps/dino-meteor/game:rules",
        "//apps/dino-meteor/render:scene",
    ],
)
