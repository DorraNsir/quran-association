#!/usr/bin/env bash
# Render the Quran pages of the source PDF (PDF 3–605) to work/pages/ (local only).
set -euo pipefail
PDF="${1:?path to the Mushaf PDF}"
DPI="${2:-100}"
mkdir -p work/pages
pdftoppm -f 3 -l 605 -r "$DPI" -jpeg -jpegopt quality=90 "$PDF" work/pages/p
