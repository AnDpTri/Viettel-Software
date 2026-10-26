#!/bin/sh
set -eu

npx prisma migrate deploy
if [ "${SEED_DEMO:-false}" = "true" ]; then
  node dist/prisma/seed.js
fi
# exec chuyển SIGTERM từ Docker tới Node để server đóng kết nối và Prisma đúng cách.
exec node dist/src/server.js
