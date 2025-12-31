# syntax=docker/dockerfile:1

# ----------------------------------------
# Stage 1: Dependencies (use Bun for fast installs)
# ----------------------------------------
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Install production dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ----------------------------------------
# Stage 2: Builder (use Bun for fast builds)
# ----------------------------------------
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Install all dependencies (including dev) for build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# ----------------------------------------
# Stage 3: Production Runner (use Node.js for compatibility)
# ----------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 remix

# Set production environment
ENV NODE_ENV=production
ENV PORT=9001

# Copy built application with correct ownership
COPY --from=builder --chown=remix:nodejs /app/build ./build
COPY --from=builder --chown=remix:nodejs /app/public ./public
COPY --from=builder --chown=remix:nodejs /app/package.json ./package.json
COPY --from=deps --chown=remix:nodejs /app/node_modules ./node_modules

# Switch to non-root user
USER remix

# Expose port
EXPOSE 9001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9001/ || exit 1

# Start the application
CMD ["npm", "run", "start"]
