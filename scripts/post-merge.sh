#!/bin/bash
set -euo pipefail

if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "Refusing to push the development schema from a production environment." >&2
  exit 1
fi

pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
