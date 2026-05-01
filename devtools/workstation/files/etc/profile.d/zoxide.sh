# Sourced by /etc/profile (login bash shells). Wires zoxide as `z`.
if command -v zoxide >/dev/null 2>&1; then
    eval "$(zoxide init bash)"
fi
