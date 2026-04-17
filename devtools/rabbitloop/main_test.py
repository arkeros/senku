import unittest
from unittest.mock import patch, MagicMock

from devtools.rabbitloop.github import ActionableComment, GitHubClient
from devtools.rabbitloop.claude import FixResult
from devtools.rabbitloop.main import run_once


def _comment(**kwargs):
    defaults = dict(
        thread_id="T_1",
        comment_body="Fix this",
        file_path="src/foo.py",
        line=10,
        diff_hunk="@@",
        url="https://github.com/arkeros/senku/pull/42#discussion_r1001",
    )
    defaults.update(kwargs)
    return ActionableComment(**defaults)


def _mock_client(comments=None):
    client = MagicMock(spec=GitHubClient)
    client.fetch_actionable_comments.return_value = comments or []
    return client


class TestRunOnce(unittest.TestCase):

    @patch("devtools.rabbitloop.main.fix")
    def test_processes_and_resolves_completed(self, mock_fix):
        client = _mock_client([_comment(thread_id="T_1")])
        mock_fix.return_value = FixResult(completed=True)

        run_once(client, "arkeros/senku", 42, "arkeros", dry_run=False)

        mock_fix.assert_called_once()
        client.resolve_thread.assert_called_once_with("T_1")

    @patch("devtools.rabbitloop.main.fix")
    def test_does_not_resolve_incomplete(self, mock_fix):
        client = _mock_client([_comment()])
        mock_fix.return_value = FixResult(completed=False)

        run_once(client, "arkeros/senku", 42, "arkeros", dry_run=False)

        mock_fix.assert_called_once()
        client.resolve_thread.assert_not_called()

    @patch("devtools.rabbitloop.main.fix")
    def test_processes_multiple_comments(self, mock_fix):
        client = _mock_client([
            _comment(thread_id="T_1"),
            _comment(thread_id="T_2"),
            _comment(thread_id="T_3"),
        ])
        mock_fix.return_value = FixResult(completed=True)

        run_once(client, "arkeros/senku", 42, "arkeros", dry_run=False)

        self.assertEqual(mock_fix.call_count, 3)
        self.assertEqual(client.resolve_thread.call_count, 3)

    @patch("devtools.rabbitloop.main.fix")
    def test_no_comments_is_noop(self, mock_fix):
        client = _mock_client([])

        run_once(client, "arkeros/senku", 42, "arkeros", dry_run=False)

        mock_fix.assert_not_called()
        client.resolve_thread.assert_not_called()

    @patch("devtools.rabbitloop.main.fix")
    def test_dry_run_passes_through(self, mock_fix):
        client = _mock_client([_comment()])
        mock_fix.return_value = FixResult(completed=False)

        run_once(client, "arkeros/senku", 42, "arkeros", dry_run=True)

        mock_fix.assert_called_once()
        call_kwargs = mock_fix.call_args.kwargs
        self.assertTrue(call_kwargs.get("dry_run", False))

    @patch("devtools.rabbitloop.main.fix")
    def test_returns_true_when_any_fix_completed(self, mock_fix):
        client = _mock_client([_comment()])
        mock_fix.return_value = FixResult(completed=True)

        result = run_once(client, "arkeros/senku", 42, "arkeros", dry_run=False)

        self.assertTrue(result)

    @patch("devtools.rabbitloop.main.fix")
    def test_returns_false_when_no_fix_completed(self, mock_fix):
        client = _mock_client([_comment()])
        mock_fix.return_value = FixResult(completed=False)

        result = run_once(client, "arkeros/senku", 42, "arkeros", dry_run=False)

        self.assertFalse(result)

    @patch("devtools.rabbitloop.main.fix")
    def test_returns_false_when_no_comments(self, mock_fix):
        client = _mock_client([])

        result = run_once(client, "arkeros/senku", 42, "arkeros", dry_run=False)

        self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()
