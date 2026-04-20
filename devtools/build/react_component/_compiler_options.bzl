"""Shared TypeScript compilerOptions baked into the react_component family.

The macros (`react_component`, `stylex_library`, `asset_library`) embed
these options into a per-target tsconfig that `ts_project` generates
from a dict. Keeping the values in starlark — rather than a checked-in
`tsconfig.json` file referenced by label — lets consuming repos
(astrograde, etc.) build out of the box without authoring or extending
their own tsconfig.

If a downstream needs a different option (`target`, `jsx`, stricter
flags, path aliases), wire a per-macro override here rather than asking
each caller to repeat the full tsconfig.
"""

BASE_COMPILER_OPTIONS = {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": True,
    "declaration": True,
    "sourceMap": True,
    "skipLibCheck": True,
    "resolveJsonModule": True,
}
