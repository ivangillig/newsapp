FROM node:20-alpine

WORKDIR /app

# Instalar dependencias de build
RUN apk add --no-cache python3 make g++

# Copiar package.json primero para cache de dependencias
COPY package*.json ./

RUN npm ci

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
