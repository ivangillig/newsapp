# Multi-stage build para Raspberry Pi
FROM node:20-alpine AS base

# Install dependencies for Puppeteer on ARM
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer to use system chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Install dependencies - copy root package files for workspace resolution
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm install --workspace=backend --omit=dev

# Copy backend app
COPY backend/ ./backend/

# Create directory for WhatsApp auth
RUN mkdir -p /app/backend/auth_info_baileys

WORKDIR /app/backend

EXPOSE 3001

CMD ["npm", "start"]
