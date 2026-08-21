# BOT-TECHDI

Bot conversacional para **TechDI** — venta de soluciones y automatizaciones de software.
Integra WhatsApp Business, Instagram y Claude AI para atender leads (preventa) y clientes
existentes (soporte pre/post-venta) por un mismo canal, con derivación a un equipo humano
organizada en Áreas configurables desde el panel de administración.

Clonado y adaptado de `BOT-ALTORANCHO` — ver `docs/superpowers/specs/2026-08-21-bot-techdi-design.md`
para el detalle de qué se sacó/adaptó y por qué.

---

## Stack

- **Frontend**: React + Vite + CSS Modules
- **Backend**: Node.js (ESM) + Express
- **Database**: Firebase Firestore (proyecto compartido `pedidos-lett-2`, colecciones con prefijo `bot-techdi_`)
- **AI**: Claude API (Anthropic)
- **Mensajería**: Meta Cloud API (WhatsApp Business + Instagram)

## Estructura

```
BOT-TECHDI/
├── client/           # Dashboard admin (React)
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── contexts/
│       ├── lib/
│       └── styles/
├── server/           # API + Webhook handler (Node/Express)
│   └── src/
│       ├── routes/
│       ├── services/
│       └── middleware/
└── docs/superpowers/  # Design spec + this implementation plan
```

## Cómo correr localmente

```bash
# Backend
cd server && npm install && npm run dev   # puerto 3001

# Frontend
cd client && npm install && npm run dev   # puerto 5173
```

Completá `server/.env` y `client/.env` a partir de sus `.env.example` antes de arrancar.
