#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
frontend_root="${repository_root}/frontend"
source_root="${frontend_root}/public/images"
output_root="${frontend_root}/.generated/r2-media/images"
rendition_count=0

if ! command -v magick >/dev/null 2>&1; then
  printf '%s\n' 'ImageMagick 7 con soporte WebP es necesario para generar variantes.' >&2
  exit 1
fi

generate_renditions() {
  local relative_source="$1"
  local quality="$2"
  shift 2

  local source_path="${source_root}/${relative_source}"
  local relative_stem="${relative_source%.*}"
  local output_path
  local width

  if [[ ! -f "${source_path}" ]]; then
    printf 'No existe el archivo de origen: %s\n' "${source_path}" >&2
    exit 1
  fi

  for width in "$@"; do
    output_path="${output_root}/${relative_stem}-${width}.webp"
    mkdir -p "$(dirname "${output_path}")"

    magick "${source_path}" \
      -auto-orient \
      -resize "${width}x>" \
      -strip \
      -quality "${quality}" \
      -define webp:method=6 \
      -define webp:alpha-quality=100 \
      "${output_path}"

    rendition_count=$((rendition_count + 1))
  done
}

generate_renditions 'age-gate/skull-optimized.webp' 86 320
generate_renditions 'brand/senor-del-mictlan-brand.png' 86 160 320 480 640 1280

generate_renditions 'catalog/calios-product.png' 86 160 360 720 1080
generate_renditions 'catalog/calios-lifestyle.png' 86 360 720 1080
generate_renditions 'catalog/mezcal-joven-product.png' 86 160 360 720 1080
generate_renditions 'catalog/mezcal-joven-lifestyle.png' 86 360 720 1080
generate_renditions 'catalog/mezcal-reposado-product.png' 86 160 360 720 1080
generate_renditions 'catalog/mezcal-reposado-lifestyle.png' 86 360 720 1080

generate_renditions 'hero-background.png' 86 640 1024 1440 1672
generate_renditions 'landing/cupreata-label.png' 86 320 640 1024
generate_renditions 'mezcal-showcase-background.png' 86 640 1024 1440 1672

# Keep the full mobile framing while offering candidates for narrow phones and high-DPR screens.
generate_renditions 'mezcal-showcase-background-mobile.png' 60 320 480
generate_renditions 'mezcal-showcase-background-mobile.png' 35 640

node "${repository_root}/scripts/generate-mobile-showcase-avif.mjs"

printf 'Se generaron %s variantes WebP y 1 AVIF para R2 en %s\n' "${rendition_count}" "${output_root}"
