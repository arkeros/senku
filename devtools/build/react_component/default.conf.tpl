server {
    listen 8080;
    root /var/www/html;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Unhashed JS entry: revalidate via ETag on every request so a
    # deploy that changes bundle contents is picked up immediately.
    # Declared before the broader /{{APP_NAME}}_bundle/ rule so it
    # takes priority for this exact URL.
    location = /{{APP_NAME}}_bundle/{{APP_NAME}}_main.js {
        add_header Cache-Control "no-cache";
    }

    # Everything else under /{{APP_NAME}}_bundle/ is content-addressed
    # by esbuild (chunk-<hash>.js, <Route>-<hash>.js). Bytes under a
    # given URL never change, so cache forever and skip the
    # revalidation round-trip.
    #
    # The `^~` modifier tells nginx to stop location matching here on a
    # prefix hit — without it, the `\.(html|css|js)$` regex below would
    # win (regex beats unmodified prefix), and every chunk request
    # would land on `no-cache`.
    location ^~ /{{APP_NAME}}_bundle/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Content-addressed static assets from asset_pipeline. URLs embed a
    # content hash, so bytes are immutable under a given URL. `^~` keeps
    # the regex below from stealing .css/.js files that live here.
    location ^~ /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # HTML/CSS/JS outside the above prefixes revalidate via ETag.
    location ~ \.(html|css|js)$ {
        add_header Cache-Control "no-cache";
    }
}
