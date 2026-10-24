FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate --config prisma7.config.ts && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
# Full node_modules kept on purpose: prisma CLI (migrate deploy) and tsx (db:seed) are needed at runtime.
COPY --from=build /app ./
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fs http://localhost:${PORT:-4000}/api/health || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy --config prisma7.config.ts && node dist/main.js"]
