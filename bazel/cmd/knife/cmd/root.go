package cmd

import (
	"context"

	"github.com/spf13/cobra"

	"github.com/arkeros/senku/bazel/cmd/knife/cmd/debversions"
	"github.com/arkeros/senku/bazel/cmd/knife/cmd/updatesnapshots"
)

var rootCmd = &cobra.Command{
	Use:   "knife",
	Short: "Knife - a Swiss-army knife for Bazel build management",
	Long:  `knife is a command-line tool for managing Bazel build infrastructure tasks.`,
}

func init() {
	rootCmd.AddCommand(debversions.NewCmdDebVersions())
	rootCmd.AddCommand(updatesnapshots.NewCmdUpdateSnapshots())
}

func Execute(ctx context.Context) error {
	return rootCmd.ExecuteContext(ctx)
}
