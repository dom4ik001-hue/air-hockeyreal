# ─── Stage 1: Dependencies ───────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only package files for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ─── Stage 2: Production image ───────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodeuser -u 1001

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=nodeuser:nodejs . .

# Remove dev files
RUN rm -f .env.* Dockerfile docker-compose.yml nginx.conf

USER nodeuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/leaderboard || exit 1

CMD ["node", "server/server.js"]
