#!/bin/sh
set -eu

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting SaaS Management Service..."
exec node .output/server/index.mjs
