FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY web ./web
RUN npm run prisma:generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x scripts/docker-entrypoint.sh && mkdir -p uploads && chown -R node:node /app
USER node
EXPOSE 3000
# SEED_DEMO=true (chỉ đặt trong docker-compose cho môi trường demo) tạo sẵn tài khoản test; seed dùng upsert nên chạy lại an toàn.
HEALTHCHECK --interval=30s --timeout=4s --start-period=45s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT || 3000) +'/ready',{signal:AbortSignal.timeout(2500)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./scripts/docker-entrypoint.sh"]
