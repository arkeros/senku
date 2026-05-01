if status is-interactive
    if command -q direnv
        direnv hook fish | source
    end
end
