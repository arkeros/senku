# knife - Swiss-army knife for Bazel build management

A command-line tool for managing Bazel build infrastructure tasks.

The tool uses the familiar `<context> <noun> <verb>` style of CLI interactions. For example, to update the grype database, you would run:

```bash
knife grype update
```

## Setup

See the repo [Setup section](../../../README.md) for Bazelisk installation, `direnv`, `bazel run //tools:dev`, and `direnv allow`.

After that, `knife` is available from the repo root.

## Usage

### grype update

Update the grype vulnerability database to the latest version:

```bash
knife grype update
```

This command:

1. Fetches the latest database metadata from grype.anchore.io
2. Updates `bazel/include/oci.MODULE.bazel` with the new URL and SHA256
3. Runs `bazel mod tidy` to update the lockfile

## Architecture

Commands use a noun-based package structure:

- `cmd/grype/` - `grype` noun (verbs: `update`)

Shared libraries:

- `bazel/pkg/grypedb` - grype database MODULE.bazel updater (via buildtools AST)
- `bazel/pkg/mod` - `bazel mod tidy` helper
