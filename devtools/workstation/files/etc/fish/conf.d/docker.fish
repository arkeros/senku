# Fish equivalent of /etc/profile.d/docker.sh: fish doesn't source
# /etc/profile.d/*.sh, so the bash-side export never reaches login fish
# shells (which is the user's default).
set -gx DOCKER_HOST unix:///run/docker.sock
