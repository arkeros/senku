// Command tf_pr_comment posts (or updates) the Terraform-plan PR comment
// for a single Bazel root.
//
// Identification is by an HTML-comment marker (e.g. `<!-- tf-plan://path -->`)
// that the caller passes via --marker; if a comment whose body starts with
// that marker already exists on the PR, we PATCH it, otherwise we POST a new
// one. This is what makes `aspect plan` re-runnable without spamming the PR.
//
// Body shape (see render.go for the full matrix):
//
//	no flags                  → posts a `Planning…` stub. Used by the
//	                            axl task immediately before invoking
//	                            `bazel run :terraform.plan` so reviewers
//	                            see "something is happening" while the
//	                            plan runs.
//	--plan-json <path>        → renders a structured summary (status
//	                            callout + per-resource action table)
//	                            from `terraform show -json` output.
//	--plan-file <path>        → human plan log; collapsed under the
//	                            structured summary if --plan-json is
//	                            also given, otherwise the body is just
//	                            the fenced log (legacy behaviour).
//
// Auth is the same as the `gh` CLI: $GITHUB_TOKEN or $GH_TOKEN. GitHub
// Actions sets the former when `pull-requests: write` is granted.
//
// Pagination is handled properly via the SDK's NextPage cursor — the
// previous bash version capped at `?per_page=100`, which would have
// silently dropped the marker on a long-discussed PR and posted duplicates.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/go-github/v85/github"
)

// defaultMaxBytes is GitHub's per-comment body limit minus headroom for
// the marker, the heading, and the code-fence delimiters we wrap plan
// output in. The hard limit is 65536; 60000 leaves room for the wrapper.
const defaultMaxBytes = 60_000

type config struct {
	marker   string
	target   string
	repo     string // owner/name
	pr       int
	planFile string // captured human plan log; collapsed under the JSON summary
	planJSON string // `terraform show -json` output; drives the structured summary
	maxBytes int
}

// issuesAPI is the subset of *github.IssuesService that this command uses.
// Pulled out so tests can supply an in-memory fake without spinning a
// real HTTP server. *github.IssuesService satisfies it directly.
type issuesAPI interface {
	ListComments(ctx context.Context, owner, repo string, number int, opts *github.IssueListCommentsOptions) ([]*github.IssueComment, *github.Response, error)
	EditComment(ctx context.Context, owner, repo string, commentID int64, comment *github.IssueComment) (*github.IssueComment, *github.Response, error)
	CreateComment(ctx context.Context, owner, repo string, number int, comment *github.IssueComment) (*github.IssueComment, *github.Response, error)
}

// findExisting walks every page of issue comments looking for the first
// one whose body starts with marker. Returns nil, nil if none match.
func findExisting(ctx context.Context, api issuesAPI, owner, repo string, pr int, marker string) (*github.IssueComment, error) {
	opt := &github.IssueListCommentsOptions{
		ListOptions: github.ListOptions{PerPage: 100},
	}
	for {
		comments, resp, err := api.ListComments(ctx, owner, repo, pr, opt)
		if err != nil {
			return nil, fmt.Errorf("list comments: %w", err)
		}
		for _, c := range comments {
			if c.Body != nil && strings.HasPrefix(*c.Body, marker) {
				return c, nil
			}
		}
		if resp == nil || resp.NextPage == 0 {
			return nil, nil
		}
		opt.Page = resp.NextPage
	}
}

// upsert finds-or-creates the marker-tagged comment and returns a
// human-readable status string suitable for the runner log.
func upsert(ctx context.Context, api issuesAPI, cfg config) (string, error) {
	owner, repo, ok := splitRepo(cfg.repo)
	if !ok {
		return "", fmt.Errorf("--repo must be owner/name (got %q)", cfg.repo)
	}

	body, err := renderBody(cfg)
	if err != nil {
		return "", err
	}

	existing, err := findExisting(ctx, api, owner, repo, cfg.pr, cfg.marker)
	if err != nil {
		return "", err
	}

	if existing != nil {
		id := existing.GetID()
		if _, _, err := api.EditComment(ctx, owner, repo, id, &github.IssueComment{Body: &body}); err != nil {
			return "", fmt.Errorf("edit comment %d: %w", id, err)
		}
		return fmt.Sprintf("updated comment %d for %s", id, cfg.target), nil
	}

	if _, _, err := api.CreateComment(ctx, owner, repo, cfg.pr, &github.IssueComment{Body: &body}); err != nil {
		return "", fmt.Errorf("create comment: %w", err)
	}
	return fmt.Sprintf("created comment for %s", cfg.target), nil
}

func splitRepo(s string) (owner, repo string, ok bool) {
	parts := strings.SplitN(s, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func parseFlags(args []string) (config, error) {
	fs := flag.NewFlagSet("tf_pr_comment", flag.ContinueOnError)
	var cfg config
	fs.StringVar(&cfg.marker, "marker", "", "HTML-comment marker that identifies the comment (required)")
	fs.StringVar(&cfg.target, "target", "", "bazel target label, used in the comment heading (required)")
	fs.StringVar(&cfg.repo, "repo", "", "owner/name (required)")
	fs.IntVar(&cfg.pr, "pr", 0, "PR number (required)")
	fs.StringVar(&cfg.planFile, "plan-file", "", "path to captured human plan log; collapsed under the JSON summary if --plan-json is also set")
	fs.StringVar(&cfg.planJSON, "plan-json", "", "path to `terraform show -json` output; drives the structured summary")
	fs.IntVar(&cfg.maxBytes, "max-bytes", defaultMaxBytes, "truncate plan-file content to this many bytes (GitHub caps comments at 65536)")
	if err := fs.Parse(args); err != nil {
		return cfg, err
	}

	var missing []string
	if cfg.marker == "" {
		missing = append(missing, "--marker")
	}
	if cfg.target == "" {
		missing = append(missing, "--target")
	}
	if cfg.repo == "" {
		missing = append(missing, "--repo")
	}
	if cfg.pr == 0 {
		missing = append(missing, "--pr")
	}
	if len(missing) > 0 {
		return cfg, fmt.Errorf("missing required flag(s): %s", strings.Join(missing, ", "))
	}
	return cfg, nil
}

func main() {
	cfg, err := parseFlags(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "tf_pr_comment:", err)
		os.Exit(2)
	}

	token := firstNonEmpty(os.Getenv("GITHUB_TOKEN"), os.Getenv("GH_TOKEN"))
	if token == "" {
		fmt.Fprintln(os.Stderr, "tf_pr_comment: GITHUB_TOKEN or GH_TOKEN must be set")
		os.Exit(1)
	}

	client := github.NewClient(nil).WithAuthToken(token)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	msg, err := upsert(ctx, client.Issues, cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "tf_pr_comment: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("tf_pr_comment:", msg)
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
