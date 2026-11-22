# Universo HBG

Ecosistema web instalable que integra HBG CORE, INSTINTO, VIBRA PRO y TERMINADOR IA, con una capa de autoridad y auditoría del lado del servidor.

## Ejecutar y operar

- Instalar dependencias: `pnpm install --frozen-lockfile`
- Frontend: `PORT=22538 pnpm --filter @workspace/universo-hbg run dev`
- API: `PORT=8080 pnpm --filter @workspace/api-server run dev`
- Verificar tipos: `pnpm typecheck`
- Ejecutar pruebas API: `pnpm --filter @workspace/api-server test`
- Ejecutar pruebas frontend: `pnpm --filter @workspace/universo-hbg test`
- Compilar todo: `pnpm build`
- Consultar estado de API y esquema: `GET /api/healthz`

Requisitos: Node.js 24, pnpm 10 y PostgreSQL cuando se ejecuta la API.

## Fuente de verdad y estructura

- `artifacts/universo-hbg`: aplicación web principal y PWA.
- `artifacts/api-server`: API, autenticación, HBG Authority, permisos, auditoría, registry y TERMINADOR.
- `lib/db/src/schema/hbg.ts`: esquema PostgreSQL de HBG.
- `artifacts/universo-hbg/src/core`: HBG CORE, contexto, memoria y enrutador de acciones.
- `artifacts/universo-hbg/src/modules`: módulos de producto.
- `artifacts/universo-hbg/src/voice`: interpretación local y ejecución de comandos compatibles.
- `.github/workflows/hbg-universe-ci.yml`: pruebas, typecheck y build de integración continua.

La rama de trabajo oficial es `replit-agent`. GitHub es la fuente de desarrollo; Replit se utiliza después para incorporar, publicar y verificar el deployment.

## Autoridad y seguridad

- Roles: `owner`, `user` y `system`.
- El modo desarrollo requiere identidad OWNER autenticada y sesión de desarrollo activa.
- Las herramientas de inspección y modificación se validan en el servidor.
- Cada escritura o eliminación requiere una concesión individual para la ruta exacta; la concesión expira como máximo a los 15 minutos.
- Los campos de autoridad enviados por el cliente se rechazan. La intención o el texto de un comando nunca otorgan permisos.
- Las operaciones sensibles generan auditoría. Si la auditoría previa no está disponible, la operación se bloquea.
- La ejecución de scripts y comandos de shell permanece deshabilitada; no debe activarse sin un entorno aislado y pruebas específicas.
- TERMINADOR exige propuesta, aprobación del OWNER y ejecución explícita. Su operación actual cambia únicamente el estado del registro de aplicaciones; no detiene procesos ni deployments.

No modificar las protecciones de HBG Authority para facilitar una función. La IA interpreta y propone; el servidor decide y valida permisos.

## Capacidades actuales

- HBG CORE: navegación de módulos, comandos locales compatibles, despacho de acciones registradas, memoria local y respaldo JSON. No hay un proveedor generativo remoto configurado por defecto; los mensajes no reconocidos no se presentan como respuestas de IA.
- INSTINTO: notas, letras y proyectos con persistencia local del navegador.
- VIBRA PRO: biblioteca local, reproducción de audio, playlists, controles de reproducción, aleatorio, repetición, volumen y preferencias persistidas.
- TERMINADOR IA: interpretación local, planificación, memoria local, lectura del registro, propuestas y ejecución autorizada de cambios del registro.
- PWA: shell y recursos estáticos se almacenan en caché después de la primera carga. Las rutas API y respuestas dinámicas no se cachean. La disponibilidad offline depende de los recursos que el dispositivo ya haya descargado.

## Variables y preparación de producción

- `DATABASE_URL`: conexión PostgreSQL obligatoria para la API.
- `HBG_OWNER_SECRET` (o el nombre heredado `HBG_OWNER_TOKEN`): credencial bootstrap del OWNER, de al menos 16 caracteres.
- El login recupera únicamente el registro OWNER existente; no crea ni sustituye identidades OWNER automáticamente.
- `PORT`: puerto de la API o del frontend según el servicio.
- `BASE_PATH`: ruta base del frontend; en el deployment actual es `/`.

La comprobación `/api/healthz` valida conectividad y existencia de las tablas esenciales de HBG. Si falta alguna, devuelve HTTP 503.

El esquema inicial versionado vive en `lib/db/migrations` y se aplica con `pnpm --filter @workspace/db migrate`. El runner usa una transacción, bloqueo advisory, versión y checksum inmutable; CI lo ejecuta dos veces contra PostgreSQL aislado para comprobar tanto aplicación como idempotencia. Para una base nueva, el comando crea las tablas de HBG. Para una base existente, primero se debe respaldar e inspeccionar el esquema real y reconciliarlo con la migración: `CREATE TABLE IF NOT EXISTS` no repara columnas o constraints de tablas preexistentes.

El comando `pnpm --filter @workspace/db run push` queda destinado al desarrollo. No usar `push-force` ni aplicar migraciones en producción sin respaldo, revisión del estado real de PostgreSQL y una ventana de mantenimiento autorizada. La base de datos de producción no se ha inspeccionado desde GitHub Actions: CI utiliza una base PostgreSQL aislada de pruebas.

## Build y publicación

El frontend genera archivos estáticos en `artifacts/universo-hbg/dist/public`. La API se compila en `artifacts/api-server/dist`.

Antes de publicar:
1. Confirmar que CI pasó en el commit exacto que se va a desplegar.
2. Confirmar que la base PostgreSQL de producción contiene el esquema requerido y que existe el registro OWNER esperado.
3. Confirmar los secretos del entorno sin imprimirlos ni compartirlos.
4. Integrar el commit validado en Replit y construir los dos artefactos.
5. Verificar `/api/healthz`, login OWNER, sesión de desarrollo, guards, módulos y PWA en el deployment real.
6. Conservar el deployment anterior y registrar commit y deployment para poder revertir.

No declarar una publicación verificada basándose únicamente en un build de GitHub.
