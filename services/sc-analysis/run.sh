#!/bin/bash
# Start the service in the foreground (e.g. inside tmux):
#   tmux new -s gos-sc './run.sh'
cd "$(dirname "$0")" && exec python3 -m gos_sc.server --config "${1:-config.json}"
