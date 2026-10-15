# ---- Stage 1: build ----
# Debian-slim (not alpine): @tensorflow/tfjs-node ships glibc-native binaries.
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: production ----
FROM node:20-slim
# ca-certificates for outbound HTTPS; libgomp1 for the TF native runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 appgroup \
  && useradd --system --uid 1001 --gid 1001 --create-home appuser

WORKDIR /app

# Install production deps only (re-fetches the tfjs-node prebuilt binary for linux).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Writable dir for the local storage fallback + logs.
RUN mkdir -p /app/uploads /app/logs && chown -R appuser:appgroup /app

USER appuser
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
