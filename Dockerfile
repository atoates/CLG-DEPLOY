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
COPY data ./data

# Optional: copy standalone HTML pages if server serves them directly
COPY signup.html ./signup.html
COPY profile.html ./profile.html
COPY admin.html ./admin.html

# Expose default port
EXPOSE 3000

# Healthcheck path is handled by server (/healthz)
CMD ["node", "server.js"]
