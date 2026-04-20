import time

from absl import app
from absl import flags
from absl import logging

from devtools.rabbitloop.github import GitHubClient
from devtools.rabbitloop.claude import fix
from devtools.rabbitloop import detect

FLAGS = flags.FLAGS

flags.DEFINE_string(
    "repo", None,
    "GitHub repository in OWNER/REPO format (default: detected via 'gh repo view').",
)
flags.DEFINE_integer(
    "pr", None,
    "Pull request number (default: detected from current branch via 'gh pr view').",
)
flags.DEFINE_string(
    "owner", None,
    "GitHub username whose thumbs-up triggers fixes "
    "(default: authenticated user via 'gh api user').",
)
flags.DEFINE_integer("interval", 120, "Polling interval in seconds.")
flags.DEFINE_bool("once", False, "Run a single iteration then exit.")
flags.DEFINE_bool("dry_run", False,
                  "Print what would be done without invoking Claude or resolving.")


def run_once(
    client: GitHubClient, repo: str, pr: int, owner: str,
    dry_run: bool = False,
) -> bool:
    """Returns True if any fix completed (caller can skip sleep)."""
    comments = client.fetch_actionable_comments(repo, pr, owner)
    # TODO: parallelize — comments are independent but processed sequentially,
    # so 10 comments × 5min timeout = 50min worst case per iteration.
    made_progress = False
    for comment in comments:
        result = fix(comment, repo, dry_run=dry_run)
        if result.completed:
            client.resolve_thread(comment.thread_id)
            made_progress = True
    return made_progress


def main(argv):
    del argv  # Unused.

    repo = FLAGS.repo or detect.detect_repo()
    if not repo:
        raise app.UsageError(
            "--repo is required and could not be auto-detected. "
            "Pass --repo OWNER/REPO or run from a repo checkout with 'gh' authenticated."
        )
    repo_parts = repo.split("/", 1)
    if len(repo_parts) != 2 or not repo_parts[0] or not repo_parts[1] or "/" in repo_parts[1]:
        raise app.UsageError("--repo must be in OWNER/REPO format")

    pr = FLAGS.pr if FLAGS.pr is not None else detect.detect_pr()
    if pr is None:
        raise app.UsageError(
            "--pr is required and could not be auto-detected. "
            "Pass --pr <number> or run from a branch with an open PR."
        )

    owner = FLAGS.owner or detect.detect_owner()
    if not owner:
        raise app.UsageError(
            "--owner is required and could not be auto-detected. "
            "Pass --owner <login> or ensure 'gh' is authenticated."
        )

    logging.info(
        "rabbitloop starting: repo=%s pr=#%d owner=%s interval=%ds",
        repo,
        pr,
        owner,
        FLAGS.interval,
    )

    client = GitHubClient()

    while True:
        made_progress = run_once(
            client, repo, pr, owner, dry_run=FLAGS.dry_run
        )
        if FLAGS.once:
            break
        if made_progress:
            logging.info("Progress made, polling again immediately")
            continue
        logging.info("Sleeping %d seconds...", FLAGS.interval)
        time.sleep(FLAGS.interval)


if __name__ == "__main__":
    app.run(main)
