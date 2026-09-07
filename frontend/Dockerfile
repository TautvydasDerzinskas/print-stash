FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS test
COPY . .
RUN npm run verify
CMD ["npm", "run", "verify"]

FROM dependencies AS build
COPY . .
# VITE_API_URL is baked in at build time (Vite env vars aren't readable at container start).
# Leave it unset to default to same-origin/localhost:8000 resolution (see src/services/api.ts),
# or pass --build-arg VITE_API_URL=https://api.example.com for a fixed backend address.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# A standalone static-file image: no nginx, no reverse proxy, no /api rewriting. This client
# talks to the backend directly (same-origin default, VITE_API_URL, or the Settings > Network
# override) — it doesn't assume anything about how or where the backend is deployed, since the
# frontend is meant to be one of several possible client apps (web today, others later).
FROM node:20-alpine AS runtime
WORKDIR /app
RUN npm install --global serve@14 --no-audit --no-fund
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
