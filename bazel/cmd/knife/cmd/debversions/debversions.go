package debversions

import (
	"fmt"
	"sort"

	"github.com/spf13/cobra"

	"github.com/arkeros/senku/distroless/pkg/lockfile"
)

type Options struct {
	Arch string
	Path string
}

func NewCmdDebVersions() *cobra.Command {
	o := &Options{}

	cmd := &cobra.Command{
		Use:   "deb-versions <lock-file>",
		Short: "Display package versions from a Debian lock file",
		Long: `Extracts and displays package name and version pairs from a Debian lock file.

Examples:
  knife deb-versions distroless/debian13.lock.json
  knife deb-versions --arch amd64 distroless/debian13.lock.json`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o.Path = args[0]
			return o.Run()
		},
	}

	cmd.Flags().StringVar(&o.Arch, "arch", "", "filter by architecture (e.g., amd64, arm64)")

	return cmd
}

func (o *Options) Run() error {
	lock, err := lockfile.ParseFile(o.Path)
	if err != nil {
		return err
	}

	if o.Arch != "" {
		byArch := lock.VersionsByArch()
		versions, ok := byArch[o.Arch]
		if !ok {
			return fmt.Errorf("architecture %q not found in lock file", o.Arch)
		}
		printVersions(versions)
	} else {
		printVersions(lock.Versions())
	}

	return nil
}

func printVersions(versions map[string]string) {
	names := make([]string, 0, len(versions))
	for name := range versions {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		fmt.Printf("%s\t%s\n", name, versions[name])
	}
}
