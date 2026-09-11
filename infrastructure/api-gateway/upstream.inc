# Shared upstream behaviour for every proxied location.
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host              $host;
# $remote_addr is the real client once the realip module has applied CF-Connecting-IP (nginx.conf).
# Both identity headers are SET, not appended: the backend must never read a chain a client can
# prepend to. CF-Connecting-IP itself is passed through untouched for the backend's own logs.
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
# The backend reads this to stamp its logs with the same id the client and gateway used.
proxy_set_header X-Request-ID      $correlation_id;
# The backend echoes the id back; the gateway already stamps every response (including its own 429s and
# 404s), so the upstream copy is dropped to keep exactly one X-Request-ID on the wire.
proxy_hide_header X-Request-ID;
proxy_connect_timeout 5s;
proxy_send_timeout    30s;
# proxy_read_timeout is set per location: streaming downloads need longer than an API call.
# A write must never be silently replayed against a different upstream.
proxy_next_upstream error timeout http_502 http_503 http_504;
proxy_next_upstream_tries 2;
