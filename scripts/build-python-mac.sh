#!/usr/bin/env bash
# Build the three Python bank-statement parsers into standalone macOS
# executables that get bundled inside the Electron .app as extraResources.
# The recipient does NOT need Python, pip, or Homebrew installed.
#
# Requirements on the BUILD machine (this Mac):
#   - Homebrew                (https://brew.sh)
#   - Homebrew's `poppler` and `pkg-config`  (needed by the `pdftotext` pip pkg)
#   - Python 3.10+            (`brew install python`)
#
# Output: build/python-bin/{dbs,ocbc,paylah}   (native Mach-O binaries)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PARSERS_DIR="src/main/parsers"
OUT_DIR="build/python-bin"
WORK_DIR="build/pyinstaller-work"
SPEC_DIR="build/pyinstaller-spec"
VENV_DIR="build/py-venv"

echo "==> Checking build prerequisites"
if ! command -v brew >/dev/null 2>&1; then
  echo "ERROR: Homebrew not found. Install from https://brew.sh, then re-run." >&2
  exit 1
fi
BREW_FORMULAE="$(brew list --formula 2>/dev/null || true)"
if ! grep -qx 'poppler' <<<"$BREW_FORMULAE"; then
  echo "ERROR: 'poppler' not installed. Run: brew install poppler pkg-config" >&2
  exit 1
fi
if ! command -v pkg-config >/dev/null 2>&1; then
  echo "ERROR: 'pkg-config' not found. Run: brew install pkg-config" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found. Run: brew install python" >&2
  exit 1
fi

echo "==> Preparing clean output directories"
rm -rf "$OUT_DIR" "$WORK_DIR" "$SPEC_DIR"
mkdir -p "$OUT_DIR" "$WORK_DIR" "$SPEC_DIR"

echo "==> Creating Python venv at $VENV_DIR"
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "==> Installing Python deps + PyInstaller"
python -m pip install --upgrade pip wheel >/dev/null
python -m pip install -r "$PARSERS_DIR/requirements.txt"
python -m pip install pyinstaller

ARCH="$(uname -m)"
export PYINSTALLER_CONFIG_DIR="$REPO_ROOT/build/pyinstaller-cache"
mkdir -p "$PYINSTALLER_CONFIG_DIR"
echo "==> Building parsers with PyInstaller (arch: $ARCH)"
for script in "$PARSERS_DIR"/*.py; do
  name="$(basename "$script" .py)"
  echo "  - $name"
  pyinstaller \
    --onefile \
    --name "$name" \
    --distpath "$OUT_DIR" \
    --workpath "$WORK_DIR" \
    --specpath "$SPEC_DIR" \
    --noconfirm \
    --log-level WARN \
    "$script"
done

deactivate

echo "==> Verifying binaries"
for bin in "$OUT_DIR"/*; do
  file "$bin"
done

echo "==> Done. Binaries written to $OUT_DIR"
