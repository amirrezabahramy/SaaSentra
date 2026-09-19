#!/bin/sh
set -eu

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting SaaSentra..."
exec node .output/server/index.mjs
