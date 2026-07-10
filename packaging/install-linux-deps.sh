#!/usr/bin/env bash
set -euo pipefail

# Tauri Linux build prerequisites:
# https://v2.tauri.app/start/prerequisites/
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libglib2.0-dev \
  libgtk-3-dev \
  pkg-config \
  patchelf \
  libfuse2 \
  file
