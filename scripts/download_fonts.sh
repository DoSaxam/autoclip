#!/bin/bash
# Download caption fonts from Google Fonts css2 API (TTF) into engine/fonts
set -u
FONT_DIR="/home/z/my-project/engine/fonts"
mkdir -p "$FONT_DIR"
UA="Mozilla/5.0"

# family|weight|outfile
FONTS=(
  "Inter|900|Inter-Black.ttf"
  "Inter|700|Inter-Bold.ttf"
  "Anton|400|Anton-Regular.ttf"
  "Bebas+Neue|400|BebasNeue-Regular.ttf"
  "Poppins|800|Poppins-ExtraBold.ttf"
  "Bangers|400|Bangers-Regular.ttf"
  "Titan+One|400|TitanOne-Regular.ttf"
  "Permanent+Marker|400|PermanentMarker-Regular.ttf"
  "Archivo+Black|400|ArchivoBlack-Regular.ttf"
  "Luckiest+Guy|400|LuckiestGuy-Regular.ttf"
  "Montserrat|900|Montserrat-Black.ttf"
  "Oswald|700|Oswald-Bold.ttf"
  "Rubik|900|Rubik-Black.ttf"
  "Lexend|800|Lexend-ExtraBold.ttf"
  "Kanit|900|Kanit-Black.ttf"
  "Alfa+Slab+One|400|AlfaSlabOne-Regular.ttf"
  "Sigmar+One|400|SigmarOne-Regular.ttf"
  "Passion+One|700|PassionOne-Bold.ttf"
  "Righteous|400|Righteous-Regular.ttf"
  "Creepster|400|Creepster-Regular.ttf"
  "Lobster|400|Lobster-Regular.ttf"
  "Pacifico|400|Pacifico-Regular.ttf"
  "Fredoka|600|Fredoka-SemiBold.ttf"
)

for entry in "${FONTS[@]}"; do
  IFS='|' read -r family weight outfile <<< "$entry"
  out="$FONT_DIR/$outfile"
  if [ -s "$out" ]; then echo "SKIP $outfile"; continue; fi
  url=$(curl -s -m 20 -A "$UA" "https://fonts.googleapis.com/css2?family=${family}:wght@${weight}" | grep -o 'https://fonts.gstatic.com/[^)]*\.ttf' | head -1)
  if [ -z "$url" ]; then echo "FAIL css $family"; continue; fi
  curl -s -m 60 -o "$out" "$url" && echo "OK $outfile ($(du -h "$out" | cut -f1))" || echo "FAIL $family"
done
echo "--- font count: $(ls "$FONT_DIR" | wc -l)"
