#!/usr/bin/env bash
set -euo pipefail

# Downloads the latest GitHub Release artifact, unpacks it with shared data, and serves it locally.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_ROOT="$SCRIPT_DIR"
RELEASES_DIR="$APP_ROOT/releases"
OUT_DIR="$APP_ROOT/out"
PORT="${PORT:-3001}"
TARGET_TAG="${TAG:-}"
REPO="${REPO:-mskilab/case-report}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to run the local HTTP server" >&2
  exit 1
fi

AUTH_HEADER=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer $GITHUB_TOKEN")
fi

if command -v sha256sum >/dev/null 2>&1; then
  HASH_BIN=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  HASH_BIN=(shasum -a 256)
else
  echo "sha256sum or shasum is required to verify the download" >&2
  exit 1
fi

API_BASE="https://api.github.com/repos/${REPO}/releases"
if [[ -n "$TARGET_TAG" ]]; then
  API_URL="${API_BASE}/tags/${TARGET_TAG}"
  echo "Fetching release metadata for tag ${TARGET_TAG} from ${REPO}..."
else
  API_URL="${API_BASE}/latest"
  echo "Fetching latest release metadata from ${REPO}..."
fi

RELEASE_JSON=$(curl -fsSL "${AUTH_HEADER[@]}" "$API_URL")

mapfile -t RELEASE_FIELDS < <(python3 - <<'PY' <<<"$RELEASE_JSON")
import json, sys, re
data = json.load(sys.stdin)
assets = data.get("assets", [])

def pick(predicate, label):
    for asset in assets:
        name = asset.get("name", "")
        if predicate(name):
            return name, asset.get("browser_download_url", "")
    sys.exit(f"Missing release asset: {label}")

tar_name, tar_url = pick(lambda n: n.startswith("build-") and n.endswith(".tar.gz"), "build-*.tar.gz")
checksum_name, checksum_url = pick(lambda n: n.startswith("build-") and n.endswith(".tar.gz.sha256"), "build-*.tar.gz.sha256")
latest_name, latest_url = pick(lambda n: n == "LATEST.txt", "LATEST.txt")
built_at_name, built_at_url = pick(lambda n: n == "LATEST_BUILT_AT.txt", "LATEST_BUILT_AT.txt")

sha = re.sub(r"^build-|\\.tar\\.gz$", "", tar_name)
print(data.get("tag_name", ""))
print(sha)
print(tar_name)
print(tar_url)
print(checksum_name)
print(checksum_url)
print(latest_url)
print(built_at_url)
PY

TAG_NAME="${RELEASE_FIELDS[0]:-}"
SHA="${RELEASE_FIELDS[1]:-}"
TARBALL_NAME="${RELEASE_FIELDS[2]:-}"
TARBALL_URL="${RELEASE_FIELDS[3]:-}"
CHECKSUM_NAME="${RELEASE_FIELDS[4]:-}"
CHECKSUM_URL="${RELEASE_FIELDS[5]:-}"
LATEST_URL="${RELEASE_FIELDS[6]:-}"
BUILT_AT_URL="${RELEASE_FIELDS[7]:-}"

if [[ -z "$TARBALL_URL" || -z "$CHECKSUM_URL" || -z "$LATEST_URL" || -z "$BUILT_AT_URL" ]]; then
  echo "Failed to resolve release assets from GitHub API response" >&2
  exit 1
fi

echo "Using release: ${TAG_NAME:-unknown}"
echo "Artifact SHA: ${SHA}"

mkdir -p "$RELEASES_DIR" "$OUT_DIR"

download() {
  local url="$1"
  local dest="$2"
  echo "Downloading $(basename "$dest")..."
  curl -fSL "${AUTH_HEADER[@]}" -H "Accept: application/octet-stream" "$url" -o "$dest"
}

TARBALL_PATH="$RELEASES_DIR/$TARBALL_NAME"
CHECKSUM_PATH="$RELEASES_DIR/$CHECKSUM_NAME"
LATEST_PATH="$RELEASES_DIR/LATEST.txt"
BUILT_AT_PATH="$RELEASES_DIR/LATEST_BUILT_AT.txt"

download "$TARBALL_URL" "$TARBALL_PATH"
download "$CHECKSUM_URL" "$CHECKSUM_PATH"
download "$LATEST_URL" "$LATEST_PATH"
download "$BUILT_AT_URL" "$BUILT_AT_PATH"

EXPECTED_SHA256=$(awk 'NR==1 {print $1}' "$CHECKSUM_PATH")
ACTUAL_SHA256=$("${HASH_BIN[@]}" "$TARBALL_PATH" | awk '{print $1}')
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

# Ship shared datasets/config alongside the static build so the app can boot.
cp -a "$APP_ROOT/shared/." "$DEPLOY_DIR/"

echo "Prepared build at $DEPLOY_DIR"
echo "Serving build on http://localhost:$PORT"
if [[ "${SKIP_SERVER:-0}" == "1" ]]; then
  echo "SKIP_SERVER=1 set; skipping HTTP server startup"
  exit 0
fi
echo "Press Ctrl+C to stop the server."
python3 -m http.server "$PORT" --directory "$DEPLOY_DIR"
