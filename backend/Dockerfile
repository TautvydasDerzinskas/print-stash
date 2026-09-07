# Build context is the repo root (see docker-compose.yml) so this stage can reach ../frontend.
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./
RUN npm run build

FROM node:20-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl
COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci --no-audit --no-fund && npx prisma generate

FROM dependencies AS test
COPY backend .
ENV DATABASE_URL="postgresql://printstash:printstash@localhost:5432/printstash_test?schema=public" \
    FILE_STORAGE=/tmp/printstash-storage
CMD ["npm", "test"]

FROM dependencies AS build
COPY backend .
RUN npm run build

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl su-exec
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=frontend-build /frontend/dist ./public
COPY backend/package*.json ./
COPY backend/prisma ./prisma
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# node:20-alpine already ships a "node" user/group at uid/gid 1000; remove it first so our own
# "appuser"/"appgroup" (which docker-entrypoint.sh re-aligns to PUID/PGID at container start)
# can claim that uid/gid without colliding.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && (deluser node 2>/dev/null || true) \
  && (delgroup node 2>/dev/null || true) \
  && addgroup -g 1000 appgroup \
  && adduser -D -u 1000 -G appgroup -s /sbin/nologin appuser \
  && mkdir -p /app/storage /app/data

EXPOSE 8000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
