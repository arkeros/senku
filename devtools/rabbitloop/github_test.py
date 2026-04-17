import unittest
from unittest.mock import patch, MagicMock

import requests

from devtools.rabbitloop.github import (
    ActionableComment,
    GitHubClient,
    _parse_threads,
)

OWNER = "arkeros"
TOKEN = "ghp_test_token"


def _make_graphql_response(threads):
    """Build a mock GraphQL JSON response."""
    return {
        "data": {
            "repository": {
                "pullRequest": {
                    "reviewThreads": {
                        "nodes": threads,
                    }
                }
            }
        }
    }


def _thread(
    thread_id="T_1",
    is_resolved=False,
    author="coderabbitai",
    body="Fix the bug",
    path="src/foo.py",
    line=10,
    diff_hunk="@@ -8,3 +8,3 @@",
    thumbs_up_users=None,
):
    if thumbs_up_users is None:
        thumbs_up_users = [OWNER]
    return {
        "id": thread_id,
        "isResolved": is_resolved,
        "comments": {
            "nodes": [
                {
                    "id": "C_1",
                    "author": {"login": author},
                    "body": body,
                    "path": path,
                    "line": line,
                    "diffHunk": diff_hunk,
                    "reactions": {
                        "nodes": [
                            {"user": {"login": u}} for u in thumbs_up_users
                        ]
                    },
                }
            ]
        },
    }


class TestParseThreads(unittest.TestCase):

    def test_parses_single_thread(self):
        data = _make_graphql_response([_thread()])
        threads = _parse_threads(data)
        self.assertEqual(len(threads), 1)
        self.assertEqual(threads[0].id, "T_1")
        self.assertFalse(threads[0].is_resolved)
        self.assertEqual(len(threads[0].comments), 1)
        self.assertEqual(threads[0].comments[0].author_login, "coderabbitai")
        self.assertEqual(threads[0].comments[0].body, "Fix the bug")
        self.assertEqual(threads[0].comments[0].path, "src/foo.py")
        self.assertEqual(len(threads[0].comments[0].reactions), 1)
        self.assertEqual(threads[0].comments[0].reactions[0].login, OWNER)

    def test_parses_empty_threads(self):
        data = _make_graphql_response([])
        threads = _parse_threads(data)
        self.assertEqual(threads, [])


class TestFetchActionableComments(unittest.TestCase):

    def _client_with_response(self, response_json):
        client = GitHubClient(token=TOKEN)
        mock_response = MagicMock()
        mock_response.json.return_value = response_json
        mock_response.raise_for_status = MagicMock()
        client._session.post = MagicMock(return_value=mock_response)
        return client

    def test_returns_actionable_comment(self):
        client = self._client_with_response(
            _make_graphql_response([_thread()])
        )
        result = client.fetch_actionable_comments("arkeros/senku", 42, OWNER)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].thread_id, "T_1")
        self.assertEqual(result[0].file_path, "src/foo.py")
        self.assertEqual(result[0].comment_body, "Fix the bug")
        self.assertEqual(result[0].line, 10)

    def test_filters_resolved_threads(self):
        client = self._client_with_response(
            _make_graphql_response([_thread(is_resolved=True)])
        )
        result = client.fetch_actionable_comments("arkeros/senku", 42, OWNER)
        self.assertEqual(result, [])

    def test_filters_non_bot_authors(self):
        client = self._client_with_response(
            _make_graphql_response([_thread(author="some-human")])
        )
        result = client.fetch_actionable_comments("arkeros/senku", 42, OWNER)
        self.assertEqual(result, [])

    def test_filters_without_owner_thumbs_up(self):
        client = self._client_with_response(
            _make_graphql_response([_thread(thumbs_up_users=["someone-else"])])
        )
        result = client.fetch_actionable_comments("arkeros/senku", 42, OWNER)
        self.assertEqual(result, [])

    def test_accepts_github_actions_bot(self):
        client = self._client_with_response(
            _make_graphql_response([_thread(author="github-actions[bot]")])
        )
        result = client.fetch_actionable_comments("arkeros/senku", 42, OWNER)
        self.assertEqual(len(result), 1)

    def test_empty_pr_returns_empty_list(self):
        client = self._client_with_response(
            _make_graphql_response([])
        )
        result = client.fetch_actionable_comments("arkeros/senku", 42, OWNER)
        self.assertEqual(result, [])

    def test_http_error_returns_empty_list(self):
        client = GitHubClient(token=TOKEN)
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = requests.HTTPError(
            "401 Unauthorized"
        )
        client._session.post = MagicMock(return_value=mock_response)
        result = client.fetch_actionable_comments("arkeros/senku", 42, OWNER)
        self.assertEqual(result, [])

    def test_graphql_error_returns_empty_list(self):
        client = GitHubClient(token=TOKEN)
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "errors": [{"message": "Something went wrong"}]
        }
        client._session.post = MagicMock(return_value=mock_response)
        result = client.fetch_actionable_comments("arkeros/senku", 42, OWNER)
        self.assertEqual(result, [])

    def test_multiple_threads_filters_correctly(self):
        threads = [
            _thread(thread_id="T_1", author="coderabbitai"),
            _thread(thread_id="T_2", is_resolved=True),
            _thread(thread_id="T_3", author="human-reviewer"),
            _thread(thread_id="T_4", thumbs_up_users=[]),
        ]
        client = self._client_with_response(
            _make_graphql_response(threads)
        )
        result = client.fetch_actionable_comments("arkeros/senku", 42, OWNER)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].thread_id, "T_1")

    def test_sends_correct_graphql_variables(self):
        client = self._client_with_response(
            _make_graphql_response([])
        )
        client.fetch_actionable_comments("myorg/myrepo", 99, OWNER)
        call_kwargs = client._session.post.call_args.kwargs
        variables = call_kwargs["json"]["variables"]
        self.assertEqual(variables["owner"], "myorg")
        self.assertEqual(variables["repo"], "myrepo")
        self.assertEqual(variables["pr"], 99)


class TestResolveThread(unittest.TestCase):

    def test_sends_mutation_with_thread_id(self):
        client = GitHubClient(token=TOKEN)
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {"resolveReviewThread": {"thread": {"isResolved": True}}}
        }
        client._session.post = MagicMock(return_value=mock_response)

        client.resolve_thread("T_123")

        call_kwargs = client._session.post.call_args.kwargs
        variables = call_kwargs["json"]["variables"]
        self.assertEqual(variables["threadId"], "T_123")

    def test_raises_on_http_error(self):
        client = GitHubClient(token=TOKEN)
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = requests.HTTPError("403")
        client._session.post = MagicMock(return_value=mock_response)

        with self.assertRaises(requests.HTTPError):
            client.resolve_thread("T_123")

    def test_raises_on_graphql_error(self):
        client = GitHubClient(token=TOKEN)
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "errors": [{"message": "Not found"}]
        }
        client._session.post = MagicMock(return_value=mock_response)

        with self.assertRaises(RuntimeError):
            client.resolve_thread("T_123")


if __name__ == "__main__":
    unittest.main()
