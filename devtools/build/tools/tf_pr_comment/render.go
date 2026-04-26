// Render the PR-comment Markdown body from one or both of:
//   - --plan-json: a `terraform show -json <planfile>` document. Used to
//     build a status callout + summary table that's scannable without
//     reading hundreds of lines of refresh chatter.
//   - --plan-file: the captured human plan log (init + refresh + plan).
//     When the JSON renders cleanly, this is collapsed into a <details>
//     block as drill-down. When the JSON is missing or unparseable,
//     this is the body — same behaviour as the pre-JSON tool.
//
// Keeping rendering separate from main lets us unit-test every shape of
// plan (no-op, mixed actions, replace, errored, missing JSON, malformed
// JSON) without touching flag parsing or the GitHub client.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// planJSON is the subset of `terraform show -json <planfile>` we render.
// See https://developer.hashicorp.com/terraform/internals/json-format#plan-representation
type planJSON struct {
	FormatVersion    string                 `json:"format_version"`
	TerraformVersion string                 `json:"terraform_version"`
	ResourceChanges  []resourceChange       `json:"resource_changes"`
	OutputChanges    map[string]changeBlock `json:"output_changes"`
	Errored          bool                   `json:"errored"`
}

type resourceChange struct {
	Address string      `json:"address"`
	Type    string      `json:"type"`
	Mode    string      `json:"mode"`
	Change  changeBlock `json:"change"`
}

type changeBlock struct {
	Actions []string `json:"actions"`
}

// actionKind collapses Terraform's array-of-strings encoding (which it
// uses to disambiguate replacement ordering: ["delete","create"] vs
// ["create","delete"]) into a single label.
type actionKind int

const (
	actionUnknown actionKind = iota
	actionNoOp
	actionRead
	actionCreate
	actionUpdate
	actionDelete
	actionReplace
	actionForget
)

func classifyActions(actions []string) actionKind {
	switch len(actions) {
	case 1:
		switch actions[0] {
		case "no-op":
			return actionNoOp
		case "read":
			return actionRead
		case "create":
			return actionCreate
		case "update":
			return actionUpdate
		case "delete":
			return actionDelete
		case "forget":
			return actionForget
		}
	case 2:
		// Either ordering of delete+create is a replacement; the order
		// only encodes the lifecycle (create_before_destroy or not).
		a, b := actions[0], actions[1]
		if (a == "delete" && b == "create") || (a == "create" && b == "delete") {
			return actionReplace
		}
	}
	return actionUnknown
}

// label is the monospace cell shown in the summary table. Glyphs match
// terraform's own (`+` create, `~` update, `-` destroy, `±` replace).
func (a actionKind) label() string {
	switch a {
	case actionCreate:
		return "+ create"
	case actionUpdate:
		return "~ update"
	case actionDelete:
		return "- destroy"
	case actionReplace:
		return "± replace"
	case actionRead:
		return "> read"
	case actionForget:
		return ". forget"
	}
	return ""
}

// sortKey orders rows in the summary table: adds → updates → replaces →
// destroys → reads → forgets. Within a kind, we sort by address.
func (a actionKind) sortKey() int {
	switch a {
	case actionCreate:
		return 0
	case actionUpdate:
		return 1
	case actionReplace:
		return 2
	case actionDelete:
		return 3
	case actionRead:
		return 4
	case actionForget:
		return 5
	}
	return 6
}

type counts struct {
	add, change, destroy, replace, forget int
}

func (c *counts) record(a actionKind) {
	switch a {
	case actionCreate:
		c.add++
	case actionUpdate:
		c.change++
	case actionDelete:
		c.destroy++
	case actionReplace:
		c.replace++
	case actionForget:
		c.forget++
	}
}

func (c counts) total() int {
	return c.add + c.change + c.destroy + c.replace + c.forget
}

// summaryLine mirrors terraform's own wording (`Plan: N to add, M to
// change, K to destroy.`) so reviewers see a familiar shape. Replace
// and forget are tacked on only when present — the common case stays
// three-clause.
func (c counts) summaryLine() string {
	parts := []string{
		fmt.Sprintf("%d to add", c.add),
		fmt.Sprintf("%d to change", c.change),
		fmt.Sprintf("%d to destroy", c.destroy),
	}
	if c.replace > 0 {
		parts = append(parts, fmt.Sprintf("%d to replace", c.replace))
	}
	if c.forget > 0 {
		parts = append(parts, fmt.Sprintf("%d to forget", c.forget))
	}
	return "Plan: " + strings.Join(parts, ", ") + "."
}

type row struct {
	kind actionKind
	addr string
}

// renderJSON produces the structured chunk: the GitHub Markdown alert
// callout, then (if any) the resource and output change tables. The
// caller wraps it with the marker + heading and the optional collapsed
// full-log.
func renderJSON(p *planJSON) string {
	var b strings.Builder

	if p.Errored {
		b.WriteString("> [!CAUTION]\n> **Plan failed.** See full output below.\n")
		return b.String()
	}

	var c counts
	var resourceRows []row
	for _, rc := range p.ResourceChanges {
		a := classifyActions(rc.Change.Actions)
		c.record(a)
		if a != actionNoOp && a != actionUnknown && a != actionRead {
			resourceRows = append(resourceRows, row{kind: a, addr: rc.Address})
		}
	}

	outNames := make([]string, 0, len(p.OutputChanges))
	for name := range p.OutputChanges {
		outNames = append(outNames, name)
	}
	sort.Strings(outNames)
	var outputRows []row
	for _, name := range outNames {
		a := classifyActions(p.OutputChanges[name].Actions)
		if a != actionNoOp && a != actionUnknown {
			outputRows = append(outputRows, row{kind: a, addr: name})
		}
	}

	if c.total() == 0 && len(outputRows) == 0 {
		b.WriteString("> [!NOTE]\n> **No changes.** Infrastructure matches configuration.\n")
		return b.String()
	}

	b.WriteString("> [!IMPORTANT]\n> **")
	b.WriteString(c.summaryLine())
	b.WriteString("**\n")

	if len(resourceRows) > 0 {
		sort.SliceStable(resourceRows, func(i, j int) bool {
			if resourceRows[i].kind != resourceRows[j].kind {
				return resourceRows[i].kind.sortKey() < resourceRows[j].kind.sortKey()
			}
			return resourceRows[i].addr < resourceRows[j].addr
		})
		b.WriteString("\n| Action | Address |\n|---|---|\n")
		for _, r := range resourceRows {
			fmt.Fprintf(&b, "| `%s` | `%s` |\n", r.kind.label(), r.addr)
		}
	}

	if len(outputRows) > 0 {
		b.WriteString("\n**Output changes:**\n")
		for _, r := range outputRows {
			fmt.Fprintf(&b, "- `%s` `%s`\n", r.kind.label(), r.addr)
		}
	}

	return b.String()
}

// renderBody builds the full PR-comment body: marker + heading, then
// (depending on which inputs are present) the structured summary, the
// raw plan log, and a footer with the terraform version.
//
// The three inputs combine like so:
//
//	planJSON empty, planFile empty → "Planning…" stub.
//	planJSON empty, planFile set   → raw plan log under a fence (legacy).
//	planJSON set,   planFile empty → structured summary only.
//	planJSON set,   planFile set   → structured summary + collapsed log.
//
// JSON read/parse failures degrade gracefully: a CAUTION/WARNING
// callout, then the raw log if available. We never return an error
// just because the JSON was missing — a failed plan is itself useful
// signal to surface to the PR.
func renderBody(cfg config) (string, error) {
	var b strings.Builder
	fmt.Fprintf(&b, "%s\n### Terraform Plan — `%s`\n\n", cfg.marker, cfg.target)

	if cfg.planFile == "" && cfg.planJSON == "" {
		b.WriteString("_Planning…_\n")
		return b.String(), nil
	}

	var plan *planJSON
	if cfg.planJSON != "" {
		raw, err := os.ReadFile(cfg.planJSON)
		switch {
		case err != nil:
			b.WriteString("> [!CAUTION]\n> **Plan failed.** No structured plan available — see output below.\n")
		default:
			var p planJSON
			if err := json.Unmarshal(raw, &p); err != nil {
				fmt.Fprintf(&b, "> [!WARNING]\n> Could not parse plan JSON: %s\n", err)
			} else {
				plan = &p
				b.WriteString(renderJSON(plan))
			}
		}
	}

	if cfg.planFile != "" {
		raw, err := os.ReadFile(cfg.planFile)
		if err != nil {
			return "", fmt.Errorf("read plan file: %w", err)
		}
		if cfg.maxBytes > 0 && len(raw) > cfg.maxBytes {
			raw = raw[:cfg.maxBytes]
		}
		if plan != nil {
			b.WriteString("\n<details><summary>Full plan output</summary>\n\n```\n")
			b.Write(raw)
			b.WriteString("\n```\n\n</details>\n")
		} else {
			b.WriteString("\n```\n")
			b.Write(raw)
			b.WriteString("\n```\n")
		}
	}

	if plan != nil && plan.TerraformVersion != "" {
		fmt.Fprintf(&b, "\n<sub>terraform %s</sub>\n", plan.TerraformVersion)
	}

	return b.String(), nil
}
