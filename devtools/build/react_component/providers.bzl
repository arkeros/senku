"Providers for the Panallet React component build system"

StylexInfo = provider(
    doc = "StyleX CSS metadata files, collected transitively through deps",
    fields = {
        "metadata": "depset of .stylex.json Files",
    },
)

ReactComponentInfo = provider(
    doc = "React component build outputs for route generation",
    fields = {
        "js_entry": "File: the main .js output file",
        "name": "string: the exported component name (matches target name)",
    },
)
