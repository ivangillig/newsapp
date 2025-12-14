FROM node:20-alpine

WORKDIR /app

# Instalar dependencias para Puppeteer
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

# Copiar package.json primero para cache de dependencias
COPY package*.json ./

RUN npm install

# Copiar código fuente
COPY . .

# Crear directorio de datos
RUN mkdir -p /app/auth_info_baileys

# Puerto
EXPOSE 3001

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "index.js"]
