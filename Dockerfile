# syntax=docker/dockerfile:1
# Build stamp: 2025-10-21 force rebuild

# --- Builder: install dev deps and build frontend ---
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# --- Runner: install prod deps and run server ---
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Only install production dependencies for runtime
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy runtime app code and built assets
COPY --from=builder /app/dist ./dist
COPY server.js ./server.js
COPY public ./public
COPY migrations ./migrations

# Copy migration and maintenance scripts
COPY migrate.js ./migrate.js
COPY restore-alerts.js ./restore-alerts.js
COPY update-tags.js ./update-tags.js
COPY update-specific-tags.js ./update-specific-tags.js
COPY alerts.json ./alerts.json

# Optional: copy standalone HTML pages if server serves them directly
COPY signup.html ./signup.html
COPY profile.html ./profile.html
COPY admin.html ./admin.html

# Data directory will be created by Railway's persistent volume or at runtime
# No need to copy empty data/ directory

# Expose default port
EXPOSE 3000

# Healthcheck path is handled by server (/healthz)
CMD ["node", "server.js"]
