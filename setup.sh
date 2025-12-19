#!/usr/bin/env bash
set -euo pipefail

# Downloads the latest GitHub Release tarball, merges shared data, and serves it locally.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_ROOT="$SCRIPT_DIR"
RELEASES_DIR="$APP_ROOT/releases"
OUT_DIR="$APP_ROOT/out"
PORT="${PORT:-3001}"
TARGET_TAG="${TAG:-}"
REPO="${REPO:-mskilab/case-report}"
CHANNEL="${CHANNEL:-stable}" # stable (default) or edge

usage() {
  cat >&2 <<EOF
Usage: $0 [--channel stable|edge] [--tag <tag>] [--repo <owner/repo>]

Defaults:
  --channel stable   (uses the latest stable GitHub Release)

Notes:
  - --channel edge uses the most recent Release, including prereleases.
  - --tag always wins over --channel.
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TARGET_TAG="${2:-}"
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --channel)
      CHANNEL="${2:-}"
      shift 2
      ;;
    --edge)
      CHANNEL="edge"
      shift
      ;;
    --stable)
      CHANNEL="stable"
      shift
      ;;
    -h|--help)
      usage
      ;;
    --)
      shift
      break
      ;;
    -*)
      usage
      ;;
    *)
      break
      ;;
  esac
done

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd jq
need_cmd tar

if command -v sha256sum >/dev/null 2>&1; then
  HASH_BIN="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  HASH_BIN="shasum -a 256"
else
  echo "Missing sha256sum or shasum" >&2
  exit 1
fi

if [[ "${SKIP_SERVER:-0}" != "1" ]]; then
  need_cmd python3
fi

AUTH_HEADER=""
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  AUTH_HEADER="Authorization: Bearer $GITHUB_TOKEN"
fi

API_BASE="https://api.github.com/repos/${REPO}/releases"
if [[ -n "$TARGET_TAG" ]]; then
  API_URL="${API_BASE}/tags/${TARGET_TAG}"
  echo "Fetching release metadata for tag ${TARGET_TAG} from ${REPO}..."
else
  case "$CHANNEL" in
    stable)
      API_URL="${API_BASE}/latest"
      echo "Fetching latest stable release metadata from ${REPO}..."
      ;;
    edge)
      API_URL="${API_BASE}"
      echo "Fetching most recent release metadata (including prereleases) from ${REPO}..."
      ;;
    *)
      echo "Unknown CHANNEL: ${CHANNEL} (expected stable|edge)" >&2
      exit 1
      ;;
  esac
fi

TMP_JSON=$(mktemp)
curl -fsSL ${AUTH_HEADER:+-H "$AUTH_HEADER"} "$API_URL" -o "$TMP_JSON"

JQ_ROOT='.'
if [[ -z "$TARGET_TAG" && "$CHANNEL" == "edge" ]]; then
  if [[ "$(jq -r 'type' "$TMP_JSON")" != "array" ]]; then
    echo "Expected GitHub API to return an array for ${API_BASE}" >&2
    exit 1
  fi
  if [[ "$(jq 'length' "$TMP_JSON")" -lt 1 ]]; then
    echo "No releases found for ${REPO}" >&2
    exit 1
  fi
  JQ_ROOT='.[0]'
fi

TARBALL_NAME=$(jq -r "${JQ_ROOT}.assets[] | select(.name|startswith(\"build-\") and endswith(\".tar.gz\")) | .name" "$TMP_JSON" | head -n1)
TARBALL_URL=$(jq -r "${JQ_ROOT}.assets[] | select(.name|startswith(\"build-\") and endswith(\".tar.gz\")) | .browser_download_url" "$TMP_JSON" | head -n1)
CHECKSUM_NAME=$(jq -r "${JQ_ROOT}.assets[] | select(.name|endswith(\".tar.gz.sha256\")) | .name" "$TMP_JSON" | head -n1)
CHECKSUM_URL=$(jq -r "${JQ_ROOT}.assets[] | select(.name|endswith(\".tar.gz.sha256\")) | .browser_download_url" "$TMP_JSON" | head -n1)
LATEST_URL=$(jq -r "${JQ_ROOT}.assets[] | select(.name==\"LATEST.txt\") | .browser_download_url" "$TMP_JSON" | head -n1)
BUILT_AT_URL=$(jq -r "${JQ_ROOT}.assets[] | select(.name==\"LATEST_BUILT_AT.txt\") | .browser_download_url" "$TMP_JSON" | head -n1)
TAG_NAME=$(jq -r "${JQ_ROOT}.tag_name // \"\"" "$TMP_JSON")
SHA="${TARBALL_NAME#build-}"
SHA="${SHA%.tar.gz}"

rm -f "$TMP_JSON"

if [[ -z "$TARBALL_URL" || -z "$CHECKSUM_URL" || -z "$LATEST_URL" || -z "$BUILT_AT_URL" ]]; then
  echo "Failed to locate release assets (tarball/checksum/LATEST files)" >&2
  exit 1
fi

echo "Using release: ${TAG_NAME:-unknown}"
echo "Artifact SHA: ${SHA}"

mkdir -p "$RELEASES_DIR" "$OUT_DIR"

download() {
  local url="$1"
  local dest="$2"
  echo "Downloading $(basename "$dest")..."
  curl -fSL ${AUTH_HEADER:+-H "$AUTH_HEADER"} -H "Accept: application/octet-stream" "$url" -o "$dest"
}

TARBALL_PATH="$RELEASES_DIR/$TARBALL_NAME"
CHECKSUM_PATH="$RELEASES_DIR/$CHECKSUM_NAME"
LATEST_PATH="$RELEASES_DIR/LATEST.txt"
BUILT_AT_PATH="$RELEASES_DIR/LATEST_BUILT_AT.txt"

download "$TARBALL_URL" "$TARBALL_PATH"
download "$CHECKSUM_URL" "$CHECKSUM_PATH"
download "$LATEST_URL" "$LATEST_PATH"
download "$BUILT_AT_URL" "$BUILT_AT_PATH"

# Mirror metadata into repo root for callers expecting it there.
cp "$LATEST_PATH" "$APP_ROOT/LATEST.txt"
cp "$BUILT_AT_PATH" "$APP_ROOT/LATEST_BUILT_AT.txt"

EXPECTED_SHA256=$(awk 'NR==1 {print $1}' "$CHECKSUM_PATH")
ACTUAL_SHA256=$($HASH_BIN "$TARBALL_PATH" | awk '{print $1}')
if [[ "$EXPECTED_SHA256" != "$ACTUAL_SHA256" ]]; then
  echo "Checksum mismatch for $TARBALL_NAME" >&2
  echo "Expected: $EXPECTED_SHA256" >&2
  echo "Actual:   $ACTUAL_SHA256" >&2
  exit 1
fi

DEPLOY_DIR="$OUT_DIR/build-$SHA"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

tar -xzf "$TARBALL_PATH" -C "$DEPLOY_DIR"

if [[ ! -d "$APP_ROOT/shared" ]]; then
  echo "shared directory not found at $APP_ROOT/shared" >&2
  exit 1
fi

cp -a "$APP_ROOT/shared/." "$DEPLOY_DIR/"

echo "Prepared build at $DEPLOY_DIR"
echo "Serving build on http://localhost:$PORT"
if [[ "${SKIP_SERVER:-0}" == "1" ]]; then
  echo "SKIP_SERVER=1 set; skipping HTTP server startup"
  exit 0
fi
echo "Press Ctrl+C to stop the server."
python3 -m http.server "$PORT" --directory "$DEPLOY_DIR"
