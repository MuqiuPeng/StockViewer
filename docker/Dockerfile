# StockViewer Next.js Application
FROM node:20-alpine AS base

# Install Python for indicator/backtest execution
RUN apk add --no-cache python3 py3-pip py3-virtualenv python3-dev build-base

# Create app directory
WORKDIR /app

# Install dependencies stage
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Use Docker-specific Next.js config with standalone output
COPY docker/next.config.docker.js ./next.config.js

# Install Python dependencies (no venv needed in container)
RUN pip install --no-cache-dir --break-system-packages pandas numpy

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install Python dependencies in runner
RUN pip install --no-cache-dir --break-system-packages pandas numpy

# Copy built application
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create public folder if needed
RUN mkdir -p ./public

# Copy Python executors
COPY --from=builder /app/data/python ./data/python

# Create data directories with proper permissions
RUN mkdir -p data/csv data/indicators data/strategies data/groups data/backtest-history data/datasets data/view-settings
RUN chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# AKTools API URL (will be overridden by docker-compose)
ENV NEXT_PUBLIC_AKTOOLS_API_URL=http://aktools:8080

CMD ["node", "server.js"]
