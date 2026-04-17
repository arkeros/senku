import dataclasses
import subprocess

import requests
from absl import logging

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"

BOT_AUTHORS = frozenset(
    {"coderabbitai", "github-actions[bot]", "copilot-pull-request-reviewer"}
)

REVIEW_THREADS_QUERY = """
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 10) {
            nodes {
              id
              databaseId
              author { login }
              body
              path
              line
              diffHunk
              reactions(content: THUMBS_UP, first: 10) {
                nodes {
                  user { login }
                }
              }
            }
          }
        }
      }
    }
  }
}
"""

RESOLVE_THREAD_MUTATION = """
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}
"""


@dataclasses.dataclass
class ActionableComment:
    thread_id: str
    comment_body: str
    file_path: str
    line: int | None
    diff_hunk: str
    url: str


@dataclasses.dataclass
class Reaction:
    login: str


@dataclasses.dataclass
class Comment:
    id: str
    database_id: int
    author_login: str
    body: str
    path: str
    line: int | None
    diff_hunk: str
    reactions: list[Reaction]


@dataclasses.dataclass
class ReviewThread:
    id: str
    is_resolved: bool
    comments: list[Comment]


def _get_gh_token() -> str:
    try:
        result = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "GitHub CLI ('gh') is not installed or not on PATH. "
            "Install 'gh' and ensure it is available on PATH."
        ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        detail = f": {stderr}" if stderr else ""
        raise RuntimeError(
            "Failed to get GitHub token via 'gh auth token'"
            f"{detail}. Run 'gh auth login' and try again."
        ) from exc
    return result.stdout.strip()


def _parse_threads(data: dict) -> list[ReviewThread]:
    thread_nodes = (
        data["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
    )
    threads = []
    for t in thread_nodes:
        comments = []
        for c in t["comments"]["nodes"]:
            reactions = [
                Reaction(login=r["user"]["login"])
                for r in c["reactions"]["nodes"]
            ]
            comments.append(Comment(
                id=c["id"],
                database_id=c["databaseId"],
                author_login=c["author"]["login"],
                body=c["body"],
                path=c["path"],
                line=c["line"],
                diff_hunk=c["diffHunk"],
                reactions=reactions,
            ))
        threads.append(ReviewThread(
            id=t["id"],
            is_resolved=t["isResolved"],
            comments=comments,
        ))
    return threads


class GitHubClient:
    def __init__(self, token: str | None = None):
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {token or _get_gh_token()}",
        })

    def _graphql(self, query: str, variables: dict) -> dict:
        response = self._session.post(
            GITHUB_GRAPHQL_URL,
            json={"query": query, "variables": variables},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        if "errors" in data:
            raise RuntimeError(
                f"GraphQL errors: {data['errors']}"
            )
        return data

    def fetch_actionable_comments(
        self, repo: str, pr: int, owner: str
    ) -> list[ActionableComment]:
        repo_owner, repo_name = repo.split("/")
        try:
            data = self._graphql(
                REVIEW_THREADS_QUERY,
                {"owner": repo_owner, "repo": repo_name, "pr": pr},
            )
        except (requests.RequestException, RuntimeError) as e:
            logging.error("Failed to fetch review threads: %s", e)
            return []

        threads = _parse_threads(data)

        actionable = []
        for thread in threads:
            if thread.is_resolved:
                continue

            if not thread.comments:
                continue

            comment = thread.comments[0]
            if comment.author_login not in BOT_AUTHORS:
                continue

            reaction_logins = {r.login for r in comment.reactions}
            if owner not in reaction_logins:
                continue

            url = (
                f"https://github.com/{repo}/pull/{pr}"
                f"#discussion_r{comment.database_id}"
            )
            actionable.append(
                ActionableComment(
                    thread_id=thread.id,
                    comment_body=comment.body,
                    file_path=comment.path,
                    line=comment.line,
                    diff_hunk=comment.diff_hunk,
                    url=url,
                )
            )

        logging.info(
            "Found %d actionable comments on PR #%d", len(actionable), pr
        )
        return actionable

    def resolve_thread(self, thread_id: str) -> None:
        self._graphql(
            RESOLVE_THREAD_MUTATION,
            {"threadId": thread_id},
        )
        logging.info("Resolved thread %s", thread_id)
