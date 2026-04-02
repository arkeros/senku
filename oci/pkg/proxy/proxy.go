package proxy

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	"github.com/google/go-containerregistry/pkg/v1/remote/transport"
)

const MaxCacheEntries = 100

type Proxy struct {
	upstream         string
	repositoryPrefix string
	scheme           string

	mu         sync.Mutex
	transports map[string]http.RoundTripper
}

// Option configures a Proxy.
type Option func(*Proxy)

// Insecure configures the proxy to use plain HTTP instead of HTTPS.
func Insecure() Option {
	return func(p *Proxy) {
		p.scheme = "http"
	}
}

func New(upstream, repositoryPrefix string, opts ...Option) *Proxy {
	p := &Proxy{
		upstream:         upstream,
		repositoryPrefix: repositoryPrefix,
		scheme:           "https",
		transports:       make(map[string]http.RoundTripper),
	}
	for _, o := range opts {
		o(p)
	}
	return p
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if r.URL.Path == "/v2/" || r.URL.Path == "/v2" {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Docker-Distribution-Api-Version", "registry/2.0")
		fmt.Fprint(w, "{}")
		return
	}

	if !strings.HasPrefix(r.URL.Path, "/v2/") {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	p.proxyRequest(w, r)
}

func RewritePath(path, repositoryPrefix string) string {
	// /v2/<name>/... → /v2/<prefix>/<name>/...
	const prefix = "/v2/"
	rest := strings.TrimPrefix(path, prefix)
	return prefix + repositoryPrefix + "/" + rest
}

// ExtractRepo extracts the repository name from the request path.
// e.g., /v2/redis/manifests/latest → redis
// e.g., /v2/go/debian13/tags/list → go/debian13
func ExtractRepo(path string) string {
	rest := strings.TrimPrefix(path, "/v2/")
	for _, op := range []string{"/manifests/", "/blobs/", "/tags/"} {
		if idx := strings.Index(rest, op); idx != -1 {
			return rest[:idx]
		}
	}
	return rest
}

func (p *Proxy) getTransport(repo string) (http.RoundTripper, error) {
	p.mu.Lock()
	if t, ok := p.transports[repo]; ok {
		p.mu.Unlock()
		return t, nil
	}
	p.mu.Unlock()

	fullRepo := p.repositoryPrefix + "/" + repo
	opts := []name.Option{name.WithDefaultRegistry(p.upstream)}
	if p.scheme == "http" {
		opts = append(opts, name.Insecure)
	}
	ref, err := name.NewRepository(fullRepo, opts...)
	if err != nil {
		return nil, fmt.Errorf("parse repository: %w", err)
	}

	t, err := transport.New(
		ref.Registry,
		authn.Anonymous,
		http.DefaultTransport,
		[]string{ref.Scope(transport.PullScope)},
	)
	if err != nil {
		return nil, fmt.Errorf("transport: %w", err)
	}

	p.mu.Lock()
	if len(p.transports) >= MaxCacheEntries {
		// Evict all entries when cache is full.
		// Simple strategy that avoids tracking access order.
		clear(p.transports)
	}
	p.transports[repo] = t
	p.mu.Unlock()

	return t, nil
}

// CacheLen returns the number of cached transports.
func (p *Proxy) CacheLen() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.transports)
}

var proxyHeaders = []string{
	"Content-Type",
	"Content-Length",
	"Docker-Content-Digest",
	"Docker-Distribution-Api-Version",
	"ETag",
	"Link",
	"Location",
}

func (p *Proxy) proxyRequest(w http.ResponseWriter, r *http.Request) {
	repo := ExtractRepo(r.URL.Path)
	t, err := p.getTransport(repo)
	if err != nil {
		http.Error(w, "transport setup failed", http.StatusBadGateway)
		return
	}

	u := *r.URL
	u.Scheme = p.scheme
	u.Host = p.upstream
	u.Path = RewritePath(r.URL.Path, p.repositoryPrefix)

	req, err := http.NewRequestWithContext(r.Context(), r.Method, u.String(), nil)
	if err != nil {
		http.Error(w, "bad request", http.StatusInternalServerError)
		return
	}

	// Forward Accept headers for content negotiation
	for _, v := range r.Header.Values("Accept") {
		req.Header.Add("Accept", v)
	}

	resp, err := t.RoundTrip(req)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if strings.Contains(r.URL.Path, "/blobs/") && resp.StatusCode < 300 {
		slog.Error("upstream returned blob body instead of redirect", "path", r.URL.Path, "status", resp.StatusCode)
		http.Error(w, "upstream did not redirect blob request", http.StatusBadGateway)
		return
	}

	for _, h := range proxyHeaders {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}

	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, resp.Body); err != nil {
		slog.Warn("failed to copy response body", "path", req.URL.Path, "error", err)
	}
}

