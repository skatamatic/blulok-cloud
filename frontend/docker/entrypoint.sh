#!/bin/sh
set -eu

# Generate runtime configuration for the SPA
BACKEND_URL_VALUE="${BACKEND_URL:-}"
BACKEND_WS_URL_VALUE="${BACKEND_WS_URL:-}"
FRONTEND_VERSION_VALUE="${FRONTEND_VERSION:-}"
FRONTEND_COMMIT_VALUE="${FRONTEND_COMMIT:-}"
FRONTEND_BUILD_URL_VALUE="${FRONTEND_BUILD_URL:-}"

# Derive WS URL from BACKEND_URL if BACKEND_WS_URL not provided
if [ -z "$BACKEND_WS_URL_VALUE" ] && [ -n "$BACKEND_URL_VALUE" ]; then
  case "$BACKEND_URL_VALUE" in
    https:*) BACKEND_WS_URL_VALUE="$(echo "$BACKEND_URL_VALUE" | sed 's/^https:/wss:/')" ;;
    http:*)  BACKEND_WS_URL_VALUE="$(echo "$BACKEND_URL_VALUE" | sed 's/^http:/ws:/')" ;;
    *)       BACKEND_WS_URL_VALUE="$BACKEND_URL_VALUE" ;;
  esac
fi

printf "window.__APP_CONFIG__={apiBaseUrl:%s,wsBaseUrl:%s,frontendVersion:%s,frontendCommit:%s,frontendBuildUrl:%s};" \
  "$(printf "%s" "'$BACKEND_URL_VALUE'")" \
  "$(printf "%s" "'$BACKEND_WS_URL_VALUE'")" \
  "$(printf "%s" "'$FRONTEND_VERSION_VALUE'")" \
  "$(printf "%s" "'$FRONTEND_COMMIT_VALUE'")" \
  "$(printf "%s" "'$FRONTEND_BUILD_URL_VALUE'")" \
  > /usr/share/nginx/html/config.js

echo "Runtime config written: BACKEND_URL=${BACKEND_URL_VALUE} BACKEND_WS_URL=${BACKEND_WS_URL_VALUE} FRONTEND_VERSION=${FRONTEND_VERSION_VALUE} FRONTEND_COMMIT=${FRONTEND_COMMIT_VALUE} FRONTEND_BUILD_URL=${FRONTEND_BUILD_URL_VALUE}"

# Start nginx in foreground
exec nginx -g 'daemon off;'


