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

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app
COPY . .

# Create directory for WhatsApp auth
RUN mkdir -p /app/auth_info_baileys

EXPOSE 3001

CMD ["npm", "start"]
