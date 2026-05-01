# Sourced by /etc/profile (login bash shells). Adds direnv hook.
if command -v direnv >/dev/null 2>&1; then
    eval "$(direnv hook bash)"
fi
