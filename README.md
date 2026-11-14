# HBG Universe

HBG Universe is a Vite + React + TypeScript workspace with a mockup sandbox and a production frontend app.

## Requisitos

- Node.js 24+
- pnpm
- PostgreSQL (if you run the API server)

## Instalación

```bash
pnpm install
```

## Desarrollo

```bash
PORT=5173 pnpm --dir artifacts/universo-hbg run dev
# o
PORT=5173 pnpm --dir artifacts/mockup-sandbox run dev
```

## Build de producción

```bash
pnpm run build
```

## Variables de entorno

Copia el archivo `.env.example` y ajústalo según tu entorno:

```bash
cp .env.example .env
```

## Publicación

La app está preparada para compilarse como un sitio estático con Vite. Para desplegarla en un host estático o contenedor, usa la salida generada por:

```bash
PORT=4173 pnpm --dir artifacts/universo-hbg run build
```

La salida estará en `artifacts/universo-hbg/dist/public`.
