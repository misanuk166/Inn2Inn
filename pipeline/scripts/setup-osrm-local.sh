#!/usr/bin/env bash
#
# One-shot setup of a local OSRM foot-routing server for the Inn2Inn pipeline.
#
# What this does:
#   1. Downloads the California OSM extract from Geofabrik (~1.3 GB) — once
#   2. Clips it to a Bay Area bbox via osmium (faster than statewide on
#      Apple Silicon, where Docker amd64 emulation chokes on the full state)
#   3. Builds a foot-profile routing graph (extract → partition → customize)
#   4. Starts osrm-routed at http://localhost:5000
#
# This bootstraps Phase A validation against Marin. For non-Marin counties,
# expand BBOX below (or rebuild against the full California PBF on a Linux
# x86_64 host — see plan).
#
# Disk: ~3 GB (CA PBF + Bay Area extract + OSRM graph)
# Time: 2–8 min on Apple Silicon (was 60+ min for full CA under Rosetta)
#
# Image: ghcr.io/project-osrm/osrm-backend:v5.27.1 — earlier 5.x versions
# (e.g. the 5.26 in the docker.io osrm/osrm-backend:latest tag) require a
# `datasource_names` file that the foot.lua profile doesn't generate, and
# crash on startup. v5.27.1 made it optional.

set -euo pipefail

OSRM_DATA_DIR="${OSRM_DATA_DIR:-$HOME/inn2inn-osrm}"
PBF_URL="https://download.geofabrik.de/north-america/us/california-latest.osm.pbf"
SOURCE_PBF="california-latest.osm.pbf"
# Bay Area bbox covers Marin, SF, East Bay, Peninsula, North/South Bay, plus
# a margin into Sonoma/Napa. Expand to add more counties.
BBOX="${OSRM_BBOX:--123.5,36.9,-121.4,38.7}"
# Use a custom OSRM_NAME (and a port via OSRM_PORT) when building a parallel
# graph for a larger region without disturbing an existing one.
OSRM_NAME="${OSRM_NAME:-bayarea-foot}"
OSRM_PORT="${OSRM_PORT:-5000}"
CLIPPED_PBF="${OSRM_NAME}.osm.pbf"
OSRM_BASE="${OSRM_NAME}"
CONTAINER_NAME="inn2inn-osrm-${OSRM_NAME}"

mkdir -p "$OSRM_DATA_DIR"
cd "$OSRM_DATA_DIR"
echo "▸ Working directory: $OSRM_DATA_DIR"
echo "▸ Bay Area bbox: $BBOX"

# 1. Download full CA PBF
if [ -f "$SOURCE_PBF" ]; then
  echo "▸ CA PBF already present ($(du -h "$SOURCE_PBF" | awk '{print $1}'))"
else
  echo "▸ Downloading California OSM extract (~1.3 GB)..."
  curl -L --progress-bar -o "$SOURCE_PBF" "$PBF_URL"
fi

# 2. Clip to Bay Area
if [ -f "$CLIPPED_PBF" ]; then
  echo "▸ Clipped Bay Area PBF already present ($(du -h "$CLIPPED_PBF" | awk '{print $1}'))"
else
  echo "▸ Clipping CA PBF to Bay Area bbox via osmium..."
  osmium extract --bbox="$BBOX" --strategy=smart --overwrite \
    -o "$CLIPPED_PBF" "$SOURCE_PBF"
  echo "  → $CLIPPED_PBF ($(du -h "$CLIPPED_PBF" | awk '{print $1}'))"
fi

# 3. Build OSRM foot graph from the smaller PBF
if [ -f "${OSRM_BASE}.osrm.fileIndex" ]; then
  echo "▸ osrm-extract output already present"
else
  echo "▸ Running osrm-extract (foot profile)..."
  docker run --rm -t -v "$OSRM_DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 \
    osrm-extract -p /opt/foot.lua "/data/$CLIPPED_PBF"
fi

if [ -f "${OSRM_BASE}.osrm.partition" ]; then
  echo "▸ osrm-partition output already present"
else
  echo "▸ Running osrm-partition..."
  docker run --rm -t -v "$OSRM_DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 \
    osrm-partition "/data/${OSRM_BASE}.osrm"
fi

if [ -f "${OSRM_BASE}.osrm.mldgr" ]; then
  echo "▸ osrm-customize output already present"
else
  # NB: cells is created by osrm-partition, not customize. The actual
  # customize outputs are mldgr + cell_metrics. Check for mldgr.
  echo "▸ Running osrm-customize..."
  docker run --rm -t -v "$OSRM_DATA_DIR:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 \
    osrm-customize "/data/${OSRM_BASE}.osrm"
fi

# 4. (Re)start the routed daemon
echo "▸ Starting osrm-routed container..."
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER_NAME" --restart unless-stopped \
  -p "${OSRM_PORT}:5000" -v "$OSRM_DATA_DIR:/data" \
  ghcr.io/project-osrm/osrm-backend:v5.27.1 \
  osrm-routed --algorithm mld "/data/${OSRM_BASE}.osrm" >/dev/null

# 5. Wait for the server to accept a sample foot route in Marin
SAMPLE_URL="http://localhost:${OSRM_PORT}/route/v1/foot/-122.5786,37.8623;-122.6388,37.8989?overview=false"
echo -n "▸ Waiting for OSRM to come up"
for i in $(seq 1 60); do
  if curl -sf "$SAMPLE_URL" >/dev/null 2>&1; then
    echo " ✓"
    echo
    echo "OSRM is running at http://localhost:${OSRM_PORT}"
    echo "  Sample call returns:"
    curl -s "$SAMPLE_URL" | head -c 200
    echo
    echo
    echo "Next: set OSRM_URL=http://localhost:${OSRM_PORT} in .env.local, then run"
    echo "      npm run pipeline -- --region=marin --only=routes,scoring,pois,ready"
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo " (timed out)"
echo "Check container logs: docker logs $CONTAINER_NAME"
exit 1
