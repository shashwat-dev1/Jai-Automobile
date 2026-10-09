# =============================================================================
# DSA OS — Frontend Dockerfile
# =============================================================================

# ---------------------------------------------------------------------------
# Development stage — hot-reload with Vite dev server
# ---------------------------------------------------------------------------
FROM node:20.17.0-alpine AS development

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]

# ---------------------------------------------------------------------------
# Build stage — production bundle
# ---------------------------------------------------------------------------
FROM node:20.17.0-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Production stage — Nginx serving static files
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS production

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy Nginx config (from nginx/ in project root)
COPY ../nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
