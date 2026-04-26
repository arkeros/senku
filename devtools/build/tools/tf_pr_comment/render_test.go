package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeJSON dumps body to a temp file and returns the path. Avoids
// hand-marshaling structs in every test — every test here knows the
// exact JSON shape it wants to assert on, so a literal is clearest.
func writeJSON(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, "plan.json")
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestClassifyActions(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want actionKind
	}{
		{"no-op", []string{"no-op"}, actionNoOp},
		{"create", []string{"create"}, actionCreate},
		{"update", []string{"update"}, actionUpdate},
		{"delete", []string{"delete"}, actionDelete},
		{"read", []string{"read"}, actionRead},
		{"forget", []string{"forget"}, actionForget},
		{"replace destroy-first", []string{"delete", "create"}, actionReplace},
		{"replace create-first", []string{"create", "delete"}, actionReplace},
		{"empty", nil, actionUnknown},
		{"garbage", []string{"frobnicate"}, actionUnknown},
		{"two-but-not-replace", []string{"update", "update"}, actionUnknown},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := classifyActions(tc.in); got != tc.want {
				t.Errorf("classifyActions(%v) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}

func TestSummaryLineThreeClause(t *testing.T) {
	c := counts{add: 2, change: 1, destroy: 0}
	got := c.summaryLine()
	if got != "Plan: 2 to add, 1 to change, 0 to destroy." {
		t.Errorf("got %q", got)
	}
}

func TestSummaryLineWithReplaceAndForget(t *testing.T) {
	c := counts{add: 1, change: 0, destroy: 0, replace: 2, forget: 1}
	got := c.summaryLine()
	if !strings.Contains(got, "2 to replace") {
		t.Errorf("expected `2 to replace` in %q", got)
	}
	if !strings.Contains(got, "1 to forget") {
		t.Errorf("expected `1 to forget` in %q", got)
	}
}

func TestRenderBodyJSONNoChanges(t *testing.T) {
	plan := writeJSON(t, `{
		"format_version": "1.2",
		"terraform_version": "1.14.0",
		"resource_changes": [
			{"address": "google_service_account.x", "change": {"actions": ["no-op"]}}
		]
	}`)
	body, err := renderBody(config{
		marker:   "<!-- m -->",
		target:   "//x",
		planJSON: plan,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "[!NOTE]") {
		t.Errorf("expected NOTE callout for no-op plan; got %q", body)
	}
	if !strings.Contains(body, "No changes") {
		t.Errorf("expected `No changes`; got %q", body)
	}
	if strings.Contains(body, "| Action |") {
		t.Errorf("should not render summary table when no changes; got %q", body)
	}
	if !strings.Contains(body, "terraform 1.14.0") {
		t.Errorf("expected terraform version footer; got %q", body)
	}
}

func TestRenderBodyJSONWithMixedChanges(t *testing.T) {
	plan := writeJSON(t, `{
		"format_version": "1.2",
		"terraform_version": "1.14.0",
		"resource_changes": [
			{"address": "a.create_one",   "change": {"actions": ["create"]}},
			{"address": "a.create_two",   "change": {"actions": ["create"]}},
			{"address": "a.update_one",   "change": {"actions": ["update"]}},
			{"address": "a.unchanged",    "change": {"actions": ["no-op"]}}
		]
	}`)
	body, err := renderBody(config{marker: "<!-- m -->", target: "//x", planJSON: plan})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "[!IMPORTANT]") {
		t.Errorf("expected IMPORTANT callout; got %q", body)
	}
	if !strings.Contains(body, "2 to add, 1 to change, 0 to destroy") {
		t.Errorf("expected summary line; got %q", body)
	}
	// All three changing rows must appear in the table.
	for _, addr := range []string{"a.create_one", "a.create_two", "a.update_one"} {
		if !strings.Contains(body, addr) {
			t.Errorf("expected %s in body; got %q", addr, body)
		}
	}
	// The no-op resource should not show up in the table.
	if strings.Contains(body, "a.unchanged") {
		t.Errorf("no-op resource should not appear in table; got %q", body)
	}
	// Adds should sort before updates.
	addIdx := strings.Index(body, "a.create_one")
	updIdx := strings.Index(body, "a.update_one")
	if addIdx == -1 || updIdx == -1 || addIdx > updIdx {
		t.Errorf("expected adds before updates; create_one@%d update_one@%d", addIdx, updIdx)
	}
}

func TestRenderBodyJSONReplace(t *testing.T) {
	plan := writeJSON(t, `{
		"format_version": "1.2",
		"resource_changes": [
			{"address": "a.replace_me", "change": {"actions": ["delete", "create"]}}
		]
	}`)
	body, err := renderBody(config{marker: "<!-- m -->", target: "//x", planJSON: plan})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "± replace") {
		t.Errorf("expected replace label; got %q", body)
	}
	if !strings.Contains(body, "1 to replace") {
		t.Errorf("expected `1 to replace` in summary; got %q", body)
	}
	if !strings.Contains(body, "0 to add") {
		t.Errorf("replace should not be double-counted as add; got %q", body)
	}
}

func TestRenderBodyJSONOutputChanges(t *testing.T) {
	plan := writeJSON(t, `{
		"format_version": "1.2",
		"resource_changes": [],
		"output_changes": {
			"GAR_REGISTRY": {"actions": ["create"]},
			"untouched":    {"actions": ["no-op"]}
		}
	}`)
	body, err := renderBody(config{marker: "<!-- m -->", target: "//x", planJSON: plan})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "Output changes") {
		t.Errorf("expected output changes section; got %q", body)
	}
	if !strings.Contains(body, "GAR_REGISTRY") {
		t.Errorf("expected output name; got %q", body)
	}
	if strings.Contains(body, "untouched") {
		t.Errorf("no-op output should not appear; got %q", body)
	}
	if strings.Contains(body, "[!NOTE]") {
		t.Errorf("output-only changes should still render IMPORTANT, not NOTE; got %q", body)
	}
}

func TestRenderBodyJSONErrored(t *testing.T) {
	plan := writeJSON(t, `{
		"format_version": "1.2",
		"errored": true,
		"resource_changes": []
	}`)
	body, err := renderBody(config{marker: "<!-- m -->", target: "//x", planJSON: plan})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "[!CAUTION]") {
		t.Errorf("expected CAUTION callout for errored plan; got %q", body)
	}
	if !strings.Contains(body, "Plan failed") {
		t.Errorf("expected `Plan failed`; got %q", body)
	}
}

func TestRenderBodyJSONMissingFileFallsBackWithCaution(t *testing.T) {
	// Plan crashed before producing JSON: still want the text log and a
	// loud CAUTION header so the reviewer sees the failure.
	tmp := t.TempDir()
	planFile := filepath.Join(tmp, "plan.txt")
	if err := os.WriteFile(planFile, []byte("Error: invalid argument"), 0o644); err != nil {
		t.Fatal(err)
	}
	body, err := renderBody(config{
		marker:   "<!-- m -->",
		target:   "//x",
		planJSON: "/no/such/path",
		planFile: planFile,
		maxBytes: defaultMaxBytes,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "[!CAUTION]") {
		t.Errorf("expected CAUTION callout when JSON missing; got %q", body)
	}
	if !strings.Contains(body, "Error: invalid argument") {
		t.Errorf("expected raw plan log appended; got %q", body)
	}
}

func TestRenderBodyJSONMalformedFallsBackToWarning(t *testing.T) {
	bad := writeJSON(t, "this is not json {{{")
	tmp := t.TempDir()
	planFile := filepath.Join(tmp, "plan.txt")
	if err := os.WriteFile(planFile, []byte("...plan body..."), 0o644); err != nil {
		t.Fatal(err)
	}
	body, err := renderBody(config{
		marker:   "<!-- m -->",
		target:   "//x",
		planJSON: bad,
		planFile: planFile,
		maxBytes: defaultMaxBytes,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "[!WARNING]") {
		t.Errorf("expected WARNING for malformed JSON; got %q", body)
	}
	if !strings.Contains(body, "...plan body...") {
		t.Errorf("expected raw plan log to still be included; got %q", body)
	}
}

func TestRenderBodyJSONCollapsesPlanFileIntoDetails(t *testing.T) {
	plan := writeJSON(t, `{
		"format_version": "1.2",
		"resource_changes": [
			{"address": "a.b", "change": {"actions": ["create"]}}
		]
	}`)
	tmp := t.TempDir()
	planFile := filepath.Join(tmp, "plan.txt")
	if err := os.WriteFile(planFile, []byte("FULL PLAN LOG"), 0o644); err != nil {
		t.Fatal(err)
	}
	body, err := renderBody(config{
		marker:   "<!-- m -->",
		target:   "//x",
		planJSON: plan,
		planFile: planFile,
		maxBytes: defaultMaxBytes,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body, "<details>") {
		t.Errorf("expected raw log collapsed under <details>; got %q", body)
	}
	if !strings.Contains(body, "FULL PLAN LOG") {
		t.Errorf("expected raw log content present; got %q", body)
	}
}

func TestParseFlagsAcceptsPlanJSON(t *testing.T) {
	cfg, err := parseFlags([]string{
		"--marker", "<!-- m -->",
		"--target", "//x",
		"--repo", "a/b",
		"--pr", "1",
		"--plan-json", "/tmp/p.json",
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.planJSON != "/tmp/p.json" {
		t.Errorf("expected planJSON propagated; got %q", cfg.planJSON)
	}
}
