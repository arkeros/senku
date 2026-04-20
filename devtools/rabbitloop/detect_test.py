import subprocess
import unittest
from unittest.mock import patch

from devtools.rabbitloop import detect


def _ok(stdout: str) -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=[], returncode=0, stdout=stdout, stderr="")


class TestDetect(unittest.TestCase):

    @patch("devtools.rabbitloop.detect.subprocess.run")
    def test_detect_repo(self, mock_run):
        mock_run.return_value = _ok("arkeros/senku\n")
        self.assertEqual(detect.detect_repo(), "arkeros/senku")

    @patch("devtools.rabbitloop.detect.subprocess.run")
    def test_detect_pr(self, mock_run):
        mock_run.return_value = _ok("115\n")
        self.assertEqual(detect.detect_pr(), 115)

    @patch("devtools.rabbitloop.detect.subprocess.run")
    def test_detect_owner(self, mock_run):
        mock_run.return_value = _ok("arkeros\n")
        self.assertEqual(detect.detect_owner(), "arkeros")

    @patch("devtools.rabbitloop.detect.subprocess.run")
    def test_returns_none_when_gh_fails(self, mock_run):
        mock_run.side_effect = subprocess.CalledProcessError(1, ["gh"])
        self.assertIsNone(detect.detect_repo())
        self.assertIsNone(detect.detect_pr())
        self.assertIsNone(detect.detect_owner())

    @patch("devtools.rabbitloop.detect.subprocess.run")
    def test_returns_none_when_gh_missing(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        self.assertIsNone(detect.detect_repo())

    @patch("devtools.rabbitloop.detect.subprocess.run")
    def test_pr_returns_none_on_non_integer(self, mock_run):
        mock_run.return_value = _ok("not-a-number\n")
        self.assertIsNone(detect.detect_pr())

    @patch("devtools.rabbitloop.detect.subprocess.run")
    def test_empty_output_returns_none(self, mock_run):
        mock_run.return_value = _ok("")
        self.assertIsNone(detect.detect_repo())


if __name__ == "__main__":
    unittest.main()
