# 📰 News App - Daily AI News Summary via WhatsApp

Una aplicación que resume noticias de múltiples portales y las envía automáticamente por WhatsApp todos los días a las 6:00 AM.

## 🚀 Features

- ✅ **Scraping automático** de portales de noticias
- 🤖 **Resumen con IA** usando OpenAI GPT-4o-mini
- 📱 **WhatsApp delivery** con Baileys (sin API paga)
- ⏰ **Cron job diario** a las 6:00 AM
- 💬 **Comandos interactivos** vía WhatsApp
- 🌐 **Frontend minimalista** para suscripciones
- 🐳 **Docker ready** para Raspberry Pi
- 💾 **Cache inteligente** para optimizar costos

## 📋 Requisitos

- Node.js 20+
- Docker (opcional, para deployment)
- OpenAI API Key
- Raspberry Pi (para deployment) o cualquier servidor Linux

## 🛠️ Setup Local

### 1. Clonar e instalar dependencias

```bash
cd news-app
npm install
```

### 2. Configurar variables de entorno

Copiar `.env.example` a `.env` y completar:

```env
OPENAI_API_KEY=sk-tu-api-key
NEWS_PORTALS=https://www.lanacion.com.ar,https://www.clarin.com
DATABASE_URL=file:./dev.db
```

### 3. Setup base de datos

```bash
cd backend
npm run prisma:migrate
npm run prisma:generate
```

### 4. Iniciar desarrollo

**Backend:**

```bash
cd backend
npm run dev
```

**Frontend:**

```bash
cd frontend
npm run dev
```

### 5. Conectar WhatsApp

Al iniciar el backend, aparecerá un QR code en la terminal. Escanéalo con WhatsApp.

## 📱 Comandos de WhatsApp

| Comando       | Descripción                            |
| ------------- | -------------------------------------- |
| `actualizame` | Recibe resumen de noticias al instante |
| `suscribir`   | Activa envíos automáticos diarios      |
| `pausar`      | Pausa la suscripción                   |
| `reanudar`    | Reactiva la suscripción                |
| `ayuda`       | Muestra todos los comandos             |

## 🐳 Deployment con Docker

### Build y run

```bash
docker-compose up -d
```

### Logs

```bash
docker-compose logs -f backend
```

### Escanear QR de WhatsApp

```bash
docker-compose logs backend | grep -A 20 "QR"
```

## 🏗️ Arquitectura

```
┌─────────────────┐
│  Frontend       │  Next.js + TailwindCSS
│  (Port 3000)    │  Landing + Subscribe form
└────────┬────────┘
         │
┌────────▼────────┐
│  Backend API    │  Express + Baileys
│  (Port 3001)    │  WhatsApp listener + Cron
└────────┬────────┘
         │
┌────────▼────────┐
│  Services       │
│  - Scraper      │  Puppeteer
│  - AI Summary   │  OpenAI
│  - WhatsApp     │  Baileys
└────────┬────────┘
         │
┌────────▼────────┐
│  Database       │  SQLite (Prisma)
│  - Users        │
│  - NewsCache    │
└─────────────────┘
```

## 📊 API Endpoints

### GET /api/summary

Obtiene el último resumen de noticias (con cache de 1 hora).

### POST /api/subscribe

Suscribe un número de teléfono.

**Body:**

```json
{
  "phone": "+5491112345678",
  "email": "optional@email.com"
}
```

### GET /api/stats

Estadísticas de usuarios suscritos.

## 🔧 Configuración de Portales

Editar `.env`:

```env
NEWS_PORTALS=https://portal1.com,https://portal2.com,https://portal3.com
```

## 💰 Costos aproximados

- **OpenAI**: ~$0.01 - $0.05 por resumen (usando gpt-4o-mini)
- **WhatsApp (Baileys)**: Gratis (usa tu número personal)
- **Hosting**: Gratis si usas Raspberry Pi + Cloudflare Tunnel

## 📝 TODO / Roadmap

- [ ] Sistema de pagos (Stripe/MercadoPago)
- [ ] Panel admin web
- [ ] Múltiples horarios de envío
- [ ] Categorías personalizadas por usuario
- [ ] Webhooks para integraciones
- [ ] Rate limiting por usuario
- [ ] Analytics dashboard

## 🤝 Contribuir

PRs bienvenidos. Para cambios mayores, abrir un issue primero.

## 📄 License

MIT

---

**Hecho con ☕ y 🤖**
