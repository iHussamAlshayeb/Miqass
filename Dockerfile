# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend

COPY backend/frontend/package*.json backend/frontend/.npmrc ./
RUN npm ci

COPY backend/frontend/ ./

ARG VITE_BASE_URL=/api
ARG VITE_CANONICAL_ORIGIN=https://www.miqass.app
ARG VITE_ONESIGNAL_PRIMARY_ORIGIN=https://www.miqass.app
ARG VITE_ONESIGNAL_ALLOWED_ORIGINS=https://www.miqass.app

ENV VITE_BASE_URL=$VITE_BASE_URL \
    VITE_CANONICAL_ORIGIN=$VITE_CANONICAL_ORIGIN \
    VITE_ONESIGNAL_PRIMARY_ORIGIN=$VITE_ONESIGNAL_PRIMARY_ORIGIN \
    VITE_ONESIGNAL_ALLOWED_ORIGINS=$VITE_ONESIGNAL_ALLOWED_ORIGINS

RUN npm run build

FROM node:22-alpine AS backend-dependencies
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

COPY --from=backend-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/package*.json ./
COPY --chown=node:node backend/server.js ./server.js
COPY --chown=node:node backend/src ./src
COPY --from=frontend-build --chown=node:node /build/frontend/dist ./frontend/dist

USER node

EXPOSE 5000

HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
