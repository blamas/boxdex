#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y --no-install-recommends build-essential python3

curl -fsSL https://mise.run | sh
echo 'eval "$(~/.local/bin/mise activate bash)"' >>~/.bashrc

~/.local/bin/mise trust
