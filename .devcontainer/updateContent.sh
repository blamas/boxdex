#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

mise install
npm ci
npx playwright install --with-deps chromium
