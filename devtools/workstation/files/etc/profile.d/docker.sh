# dockerd listens at /run/docker.sock; on standard Debian /var/run is a
# symlink to /run so the default CLI path /var/run/docker.sock resolves.
# Belt-and-braces: also export DOCKER_HOST so tools that don't read the
# default socket path work.
export DOCKER_HOST=unix:///run/docker.sock
