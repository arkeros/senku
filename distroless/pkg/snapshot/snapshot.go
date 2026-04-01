package snapshot

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"go.yaml.in/yaml/v4"
)

var timestampRegex = regexp.MustCompile(`\d{8}T\d{6}Z`)

type Source struct {
	Channel string   `yaml:"channel"`
	URL     string   `yaml:"url,omitempty"`
	URLs    []string `yaml:"urls,omitempty"`
}

type Manifest struct {
	Version  int      `yaml:"version"`
	Sources  []Source `yaml:"sources"`
	Archs    []string `yaml:"archs"`
	Packages []string `yaml:"packages"`

	header string
}

func ParseManifest(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest: %w", err)
	}

	// Extract header comments
	header, body := splitHeader(string(data))

	var m Manifest
	if err := yaml.Unmarshal([]byte(body), &m); err != nil {
		return nil, fmt.Errorf("failed to parse manifest: %w", err)
	}
	m.header = header

	return &m, nil
}

func splitHeader(content string) (header, body string) {
	lines := strings.Split(content, "\n")
	var headerLines []string
	bodyStart := 0
	for i, line := range lines {
		if strings.HasPrefix(line, "#") || line == "" {
			headerLines = append(headerLines, line)
		} else {
			bodyStart = i
			break
		}
	}
	return strings.Join(headerLines, "\n"), strings.Join(lines[bodyStart:], "\n")
}

func UpdateSnapshotURL(url, newTimestamp string) string {
	return timestampRegex.ReplaceAllString(url, newTimestamp)
}

func isSecurityChannel(channel string) bool {
	return strings.Contains(channel, "security")
}

// UpdateTimestamps updates all source URLs with the appropriate timestamp.
// debianTimestamp is used for non-security sources, securityTimestamp for security sources.
func (m *Manifest) UpdateTimestamps(debianTimestamp, securityTimestamp string) {
	for i := range m.Sources {
		src := &m.Sources[i]
		var ts string
		if isSecurityChannel(src.Channel) {
			ts = securityTimestamp
		} else {
			ts = debianTimestamp
		}

		if src.URL != "" {
			src.URL = UpdateSnapshotURL(src.URL, ts)
		}
		for j := range src.URLs {
			src.URLs[j] = UpdateSnapshotURL(src.URLs[j], ts)
		}
	}
}

func (m *Manifest) WriteFile(path string) error {
	var buf strings.Builder
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(m); err != nil {
		return fmt.Errorf("failed to marshal manifest: %w", err)
	}

	var content string
	if m.header != "" {
		content = m.header + "\n" + buf.String()
	} else {
		content = buf.String()
	}

	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("failed to write manifest: %w", err)
	}

	return nil
}
