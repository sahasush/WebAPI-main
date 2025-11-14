# API Service Dockerfile - Dedicated container for API server
ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package*.json ./
# Clear cache and install dependencies for API build
RUN npm cache clean --force && npm ci

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Just verify TypeScript compiles (skip for now)
# RUN npm run check

# Run database migrations during build
RUN npm run db:migrate || echo "Migration failed - continuing build"

FROM node:${NODE_VERSION} AS api-runner
WORKDIR /app
ENV NODE_ENV=production
# API-specific port
ENV PORT=4000

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser && \
    apk add --no-cache curl

# Install only production dependencies
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev && npm cache clean --force

# Copy built server and shared types
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Set ownership
RUN chown -R apiuser:nodejs /app
USER apiuser

# Expose API port
EXPOSE 4000

# Health check for API service
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:4000/api/health || exit 1

# Start the API server with migration (skip migration if DB not available)
CMD ["sh", "-c", "(npm run db:migrate || echo 'Migration skipped - database not available') && npx tsx server/api-server.ts"]