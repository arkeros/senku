package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/go-github/v85/github"
)

// fakeIssues is an in-memory implementation of issuesAPI used to assert
// the upsert / pagination contract without hitting GitHub. Each test
// constructs its own instance and inspects the recorded calls.
type fakeIssues struct {
	pages       [][]*github.IssueComment // pages[i] = comments returned for page i+1
	listCalls   int
	editedID    int64
	editedBody  string
	createdBody string
	createdPR   int
	listErr     error
}

func (f *fakeIssues) ListComments(_ context.Context, _, _ string, _ int, opts *github.IssueListCommentsOptions) ([]*github.IssueComment, *github.Response, error) {
	f.listCalls++
	if f.listErr != nil {
		return nil, nil, f.listErr
	}
	page := 1
	if opts != nil && opts.Page > 0 {
		page = opts.Page
	}
	if page-1 >= len(f.pages) {
		return nil, &github.Response{}, nil
	}
	resp := &github.Response{}
	if page < len(f.pages) {
		resp.NextPage = page + 1
	}
	return f.pages[page-1], resp, nil
}

func (f *fakeIssues) EditComment(_ context.Context, _, _ string, id int64, c *github.IssueComment) (*github.IssueComment, *github.Response, error) {
	f.editedID = id
	if c != nil && c.Body != nil {
		f.editedBody = *c.Body
	}
	return c, &github.Response{}, nil
}

func (f *fakeIssues) CreateComment(_ context.Context, _, _ string, pr int, c *github.IssueComment) (*github.IssueComment, *github.Response, error) {
	f.createdPR = pr
	if c != nil && c.Body != nil {
		f.createdBody = *c.Body
	}
	return c, &github.Response{}, nil
}

func ptr(s string) *string { return &s }

func TestRenderBodyStub(t *testing.T) {
	body, err := renderBody(config{
		marker: "<!-- m -->",
		target: "//foo:bar",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(body, "<!-- m -->") {
		t.Errorf("body should start with marker; got %q", body)
	}
	if !strings.Contains(body, "//foo:bar") {
		t.Errorf("body should mention target; got %q", body)
	}
	if !strings.Contains(body, "Planning") {
		t.Errorf("stub body should say Planning; got %q", body)
	}
	if strings.Contains(body, "```") {
		t.Errorf("stub body should not contain code fences; got %q", body)
	}
}

func TestRenderBodyFromPlanFile(t *testing.T) {
	tmp := t.TempDir()
	plan := filepath.Join(tmp, "plan.txt")
	if err := os.WriteFile(plan, []byte("Plan: 1 to add."), 0o644); err != nil {
		t.Fatal(err)
	}
	body, err := renderBody(config{
		marker:   "<!-- m -->",
		target:   "//foo:bar",
		planFile: plan,
		maxBytes: defaultMaxBytes,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "Plan: 1 to add.") {
		t.Errorf("body should include plan output; got %q", body)
	}
	if !strings.Contains(body, "```") {
		t.Errorf("body should wrap plan output in a code fence; got %q", body)
	}
}

func TestRenderBodyTruncates(t *testing.T) {
	tmp := t.TempDir()
	plan := filepath.Join(tmp, "plan.txt")
	big := strings.Repeat("x", 1000)
	if err := os.WriteFile(plan, []byte(big), 0o644); err != nil {
		t.Fatal(err)
	}
	body, err := renderBody(config{
		marker:   "<!-- m -->",
		target:   "//t",
		planFile: plan,
		maxBytes: 100,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Body has fixed wrapper overhead; content portion must be ≤ 100.
	if c := strings.Count(body, "x"); c != 100 {
		t.Errorf("expected exactly 100 plan bytes after truncation; got %d", c)
	}
}

func TestRenderBodyMissingPlanFile(t *testing.T) {
	_, err := renderBody(config{
		marker:   "<!-- m -->",
		target:   "//t",
		planFile: "/no/such/path",
		maxBytes: defaultMaxBytes,
	})
	if err == nil {
		t.Fatal("expected error for missing plan file; got nil")
	}
}

func TestUpsertCreatesWhenNoMarkerMatch(t *testing.T) {
	f := &fakeIssues{
		pages: [][]*github.IssueComment{
			{{ID: github.Ptr(int64(1)), Body: ptr("hello")},
				{ID: github.Ptr(int64(2)), Body: ptr("world")}},
		},
	}
	cfg := config{
		marker: "<!-- tf-plan://x -->",
		target: "//x",
		repo:   "acme/widgets",
		pr:     7,
	}
	msg, err := upsert(context.Background(), f, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if f.editedID != 0 {
		t.Errorf("should not have edited any comment; edited %d", f.editedID)
	}
	if f.createdPR != 7 {
		t.Errorf("should have created on PR 7; got %d", f.createdPR)
	}
	if !strings.HasPrefix(f.createdBody, cfg.marker) {
		t.Errorf("created body should start with marker; got %q", f.createdBody)
	}
	if !strings.Contains(msg, "created") {
		t.Errorf("status should say created; got %q", msg)
	}
}

func TestUpsertEditsWhenMarkerMatches(t *testing.T) {
	marker := "<!-- tf-plan://x -->"
	f := &fakeIssues{
		pages: [][]*github.IssueComment{
			{{ID: github.Ptr(int64(99)), Body: ptr(marker + "\nold body")}},
		},
	}
	cfg := config{
		marker: marker,
		target: "//x",
		repo:   "acme/widgets",
		pr:     1,
	}
	msg, err := upsert(context.Background(), f, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if f.editedID != 99 {
		t.Errorf("expected edit on comment 99; got %d", f.editedID)
	}
	if f.createdBody != "" {
		t.Errorf("should not have created a new comment; got %q", f.createdBody)
	}
	if !strings.HasPrefix(f.editedBody, marker) {
		t.Errorf("edited body should start with marker; got %q", f.editedBody)
	}
	if !strings.Contains(msg, "updated") {
		t.Errorf("status should say updated; got %q", msg)
	}
}

func TestUpsertWalksAllPages(t *testing.T) {
	marker := "<!-- tf-plan://target-on-page-3 -->"
	page1 := make([]*github.IssueComment, 100)
	page2 := make([]*github.IssueComment, 100)
	for i := range page1 {
		page1[i] = &github.IssueComment{ID: github.Ptr(int64(i + 1)), Body: ptr("noise")}
		page2[i] = &github.IssueComment{ID: github.Ptr(int64(i + 101)), Body: ptr("more noise")}
	}
	page3 := []*github.IssueComment{
		{ID: github.Ptr(int64(250)), Body: ptr(marker + "\nstale")},
	}
	f := &fakeIssues{pages: [][]*github.IssueComment{page1, page2, page3}}

	cfg := config{marker: marker, target: "//t", repo: "a/b", pr: 1}
	if _, err := upsert(context.Background(), f, cfg); err != nil {
		t.Fatal(err)
	}
	if f.listCalls != 3 {
		t.Errorf("expected 3 List calls (full pagination); got %d", f.listCalls)
	}
	if f.editedID != 250 {
		t.Errorf("expected to edit comment 250 on page 3; got %d", f.editedID)
	}
}

func TestUpsertBadRepo(t *testing.T) {
	cfg := config{
		marker: "<!-- m -->",
		target: "//x",
		repo:   "no-slash-here",
		pr:     1,
	}
	_, err := upsert(context.Background(), &fakeIssues{}, cfg)
	if err == nil || !strings.Contains(err.Error(), "owner/name") {
		t.Errorf("expected owner/name validation error; got %v", err)
	}
}

func TestUpsertSurfacesListError(t *testing.T) {
	f := &fakeIssues{listErr: errors.New("boom")}
	_, err := upsert(context.Background(), f, config{
		marker: "<!-- m -->", target: "//t", repo: "a/b", pr: 1,
	})
	if err == nil {
		t.Fatal("expected list error to propagate")
	}
	if !strings.Contains(err.Error(), "boom") {
		t.Errorf("expected wrapped list error to contain 'boom'; got %v", err)
	}
}

func TestParseFlagsRequiresAll(t *testing.T) {
	_, err := parseFlags([]string{"--marker", "x"})
	if err == nil {
		t.Fatal("expected error for missing required flags")
	}
	for _, want := range []string{"--target", "--repo", "--pr"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should mention %s; got %v", want, err)
		}
	}
}

func TestParseFlagsHappyPath(t *testing.T) {
	cfg, err := parseFlags([]string{
		"--marker", "<!-- m -->",
		"--target", "//x:y",
		"--repo", "a/b",
		"--pr", "42",
		"--plan-file", "/tmp/p",
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.pr != 42 || cfg.repo != "a/b" || cfg.target != "//x:y" || cfg.planFile != "/tmp/p" {
		t.Errorf("flags not parsed as expected: %+v", cfg)
	}
	if cfg.maxBytes != defaultMaxBytes {
		t.Errorf("max-bytes default not applied: %d", cfg.maxBytes)
	}
}
