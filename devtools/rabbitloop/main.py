import time

from absl import app
from absl import flags
from absl import logging

from devtools.rabbitloop.github import GitHubClient
from devtools.rabbitloop.claude import fix

FLAGS = flags.FLAGS

flags.DEFINE_string("repo", None, "GitHub repository in OWNER/REPO format.")
flags.DEFINE_integer("pr", None, "Pull request number.")
flags.DEFINE_string(
    "owner", None,
    "GitHub username whose thumbs-up triggers fixes (default: repo owner).",
)
flags.DEFINE_integer("interval", 120, "Polling interval in seconds.")
flags.DEFINE_bool("once", False, "Run a single iteration then exit.")
flags.DEFINE_bool("dry_run", False,
                  "Print what would be done without invoking Claude or resolving.")

flags.mark_flags_as_required(["repo", "pr"])


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

    repo_parts = FLAGS.repo.split("/", 1)
    if len(repo_parts) != 2 or not repo_parts[0] or not repo_parts[1] or "/" in repo_parts[1]:
        raise app.UsageError("--repo must be in OWNER/REPO format")
    repo_owner, _ = repo_parts
    owner = FLAGS.owner or repo_owner

    logging.info(
        "rabbitloop starting: repo=%s pr=#%d owner=%s interval=%ds",
        FLAGS.repo,
        FLAGS.pr,
        owner,
        FLAGS.interval,
    )

    client = GitHubClient()

    while True:
        made_progress = run_once(
            client, FLAGS.repo, FLAGS.pr, owner, dry_run=FLAGS.dry_run
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
