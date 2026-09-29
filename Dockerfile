FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run prisma:generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist
COPY public ./public
RUN mkdir -p uploads && chown -R node:node /app
USER node
EXPOSE 3000
# SEED_DEMO=true (chỉ đặt trong docker-compose cho môi trường demo) tạo sẵn tài khoản test; seed dùng upsert nên chạy lại an toàn.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_DEMO\" = \"true\" ]; then node dist/prisma/seed.js; fi && node dist/src/server.js"]
