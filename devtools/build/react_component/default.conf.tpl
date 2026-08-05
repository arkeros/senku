server {
    listen 8080;
    root /var/www/html;
    index index.html index.htm;

    # The policy's default, at server level so it is what a request
    # inherits when none of the generated locations below claim it. Each of
    # those redefines `add_header`, which in nginx replaces the inherited
    # set rather than adding to it — so exactly one Cache-Control goes out.
    add_header Cache-Control "{{DEFAULT_CACHE_CONTROL}}";

    location / {
        try_files $uri $uri/ /index.html;
    }

    # nginx's bundled mime.types has no entry for .webmanifest, so the file
    # would go out as application/octet-stream and some browsers decline to
    # install the app.
    #
    # Set with `default_type` on this one path rather than a `types` block: a
    # `types` block inside `server` *replaces* the inherited mime.types
    # wholesale, which silently turns every .png and .css into
    # application/octet-stream.
    location = /manifest.webmanifest {
        default_type application/manifest+json;
    }

    # Generated from the app's cache policy — see
    # //devtools/build/react_component:cache.bzl. The same list is rendered
    # as object metadata for the bucket origin, so edit it there, never
    # here.
{{CACHE_LOCATIONS}}
}
