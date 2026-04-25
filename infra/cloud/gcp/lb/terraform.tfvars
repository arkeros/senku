project_id = "senku-prod"

# Vanity domain for the registry proxy. Apply-time: create an A record for
# this pointing at the `lb_ip` output; managed cert issuance completes once
# DNS resolves. If/when other services share this LB, extend with extra
# `host_rule` + `path_matcher` blocks in main.tf (one cert per domain via
# additional certificate_map_entry resources).
domain = "distroless.io"

backend_states = {
  registry = "oci/cmd/registry/terraform"
}
