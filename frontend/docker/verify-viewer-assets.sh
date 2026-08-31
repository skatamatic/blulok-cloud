#!/bin/sh
# Fail the Docker/CI build if Facility Viewer environment assets are missing or truncated.
# Usage: verify-viewer-assets.sh [public|dist]
set -eu

ROOT="${1:-public}/bludesign/environment"

require_file() {
  rel="$1"
  min_bytes="${2:-0}"
  path="$ROOT/$rel"
  if [ ! -f "$path" ]; then
    echo "Missing viewer environment asset: $path" >&2
    exit 1
  fi
  if [ "$min_bytes" -gt 0 ]; then
    size=$(wc -c < "$path" | tr -d ' ')
    if [ "$size" -lt "$min_bytes" ]; then
      echo "Viewer environment asset too small ($size bytes, need >= $min_bytes): $path" >&2
      exit 1
    fi
  fi
}

# Keep in sync with ScenePresets.ts SKY_PRESET_ASSETS / GROUND_PRESET_ASSETS.
require_file "sky/natural_2k.hdr" 1000000
require_file "sky/space_2k.exr" 1000000
require_file "ground/grass_diffuse.jpg" 10000
require_file "ground/grass_normal.jpg" 10000
require_file "ground/concrete_diffuse.jpg" 10000
require_file "ground/concrete_normal.jpg" 10000

echo "Verified viewer environment assets under $ROOT"
