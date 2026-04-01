# knife - Swiss-army knife for Bazel build management

A command-line tool for managing Bazel build infrastructure tasks.

## Setup

See the repo [Setup section](../../../README.md) for Bazelisk installation, `direnv`, `bazel run //tools:dev`, and `direnv allow`.

After that, `knife` is available from the repo root.

## Usage

### deb-versions

Display package versions from a Debian lock file:

```bash
knife deb-versions distroless/debian13.lock.json
```

Filter by architecture:

```bash
knife deb-versions --arch amd64 distroless/debian13.lock.json
```

### update-snapshots

Update Debian snapshot timestamps in a manifest YAML file:

```bash
knife update-snapshots distroless/debian13.yaml
```

This command:

1. Fetches the latest snapshot timestamps from snapshot.debian.org
2. Updates all source URLs in the YAML file with the new timestamps
3. Prints a reminder to regenerate the lockfile

## Architecture

Commands follow the [kubectl pattern](https://github.com/kubernetes/kubectl/tree/master/pkg/cmd) with separate packages per command:

- `cmd/debversions/` - `deb-versions` subcommand
- `cmd/updatesnapshots/` - `update-snapshots` subcommand

Domain logic lives in `//distroless/pkg/`:

- `distroless/pkg/lockfile` - Debian lock file parsing
- `distroless/pkg/snapshot` - Manifest parsing and snapshot fetching
