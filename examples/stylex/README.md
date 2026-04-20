# stylex example

End-to-end react_app with StyleX, i18n (MF2), assets, and runtime config.

## Layout

Each component gets its own folder with its `.tsx`, MF2 fragments, assets, and
`BUILD` colocated. Folders are grouped into three tiers by role:

| Dir              | What lives here                       | Knows about                            |
| ---------------- | ------------------------------------- | -------------------------------------- |
| `ui/theme/`      | Design tokens (StyleX vars)           | Nothing app-specific                   |
| `ui/components/` | Design-system primitives (Button, …)  | Only `ui/theme` + other `ui/`          |
| `components/`    | App-shell composites (Layout, errors) | Routing, i18n runtime, app composition |
| `pages/`         | Route leaves (one folder per route)   | `ui/` + `components/` as needed        |

**Rule of thumb for new components:** if it imports from `react-router`,
references app-wide error handling, or is wired into a named slot on
`react_app` (`layout`, `error_component`), it belongs in `components/`. If it's
reusable across apps and touches only design tokens, it belongs in
`ui/components/`.

## Adding a locale

Drop `<Component>.<locale>.mf2.json` next to the component. The per-folder
`BUILD` uses `glob()`, so no BUILD edit is needed. Then add the locale to
`locales = [...]` in the root `react_app`.
