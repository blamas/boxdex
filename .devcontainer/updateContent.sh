#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"

mise install
mise reshim
npm ci
npx playwright install --with-deps chromium
