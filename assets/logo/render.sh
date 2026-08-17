#!/usr/bin/env bash
# Renders the logo SVGs to the PNG sizes the extension needs.
#
# Chrome extensions do not accept SVG icons, so the PNGs are build output — but
# they are committed, because the manifest references them and the repo has no
# build step. This script exists so they stay reproducible: same SVG in, same
# PNG out (docs/deployment.md, artefact hash).
#
# Sizes: 16/24/32 for action.default_icon (toolbar, 1x/1.5x/2x DPI),
#        16/48/128 for the top-level icons key (favicon / extensions page / store).
#
# Usage: bash assets/logo/render.sh [variant]     e.g. `render.sh variant-c-shield`
#        With no argument every variant is rendered into assets/logo/preview/.
#        With a variant name it also writes src/icons/, i.e. it picks the winner.

set -eu
cd "$(dirname "$0")/../.."

CHROME="${CHROME_BIN:-$(find "$HOME/.cache/puppeteer/chrome" -name chrome -type f -perm -u+x 2>/dev/null | head -1)}"
[ -n "$CHROME" ] || { echo "no Chrome found; set CHROME_BIN" >&2; exit 1; }

SIZES="16 24 32 48 128"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

render() {  # render <svg-path> <size> <out-png>
  local svg="$1" size="$2" out="$3"
  # An HTML wrapper is needed because --window-size clips the SVG document
  # instead of scaling it. margin:0 keeps the mark flush with the viewport.
  cat > "$WORK/page.html" <<HTML
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0}img{display:block;width:${size}px;height:${size}px}</style>
<img src="file://$PWD/$svg">
HTML
  "$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --default-background-color=00000000 \
    --window-size="$size,$size" --screenshot="$out" "$WORK/page.html" 2>/dev/null
}

mkdir -p assets/logo/preview
for svg in assets/logo/variant-*.svg; do
  name="$(basename "$svg" .svg)"
  for size in $SIZES; do
    render "$svg" "$size" "assets/logo/preview/${name}-${size}.png"
  done
  echo "rendered $name"
done

if [ "$#" -ge 1 ]; then
  mkdir -p src/icons
  for size in $SIZES; do
    render "assets/logo/$1.svg" "$size" "src/icons/icon-${size}.png"
  done
  echo "selected $1 -> src/icons/"
fi
