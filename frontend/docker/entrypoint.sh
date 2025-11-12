#!/bin/sh
set -eu

# Generate runtime configuration for the SPA
BACKEND_URL_VALUE="${BACKEND_URL:-}"
echo "window.__APP_CONFIG__={apiBaseUrl:'${BACKEND_URL_VALUE}'};" > /usr/share/nginx/html/config.js
echo "Runtime config written: BACKEND_URL=${BACKEND_URL_VALUE}"

# Start nginx in foreground
exec nginx -g 'daemon off;'


