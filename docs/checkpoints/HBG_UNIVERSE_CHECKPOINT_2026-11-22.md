# Universo HBG — checkpoint de continuidad

Fecha: 2026-11-22
Rama de trabajo: `replit-agent`
HEAD de código validado antes de esta actualización documental: `c80d9f3e8c4db5261766b059fa0e5d56a089e5ac`
GitHub Actions CI: run `45071423768` — `success` sobre ese SHA.

## Orden oficial que permanece vigente

- GitHub es la fuente única de desarrollo y finalización. No adaptar la aplicación a las limitaciones del workspace de Replit.
- Replit se utiliza después para incorporar el código final, configurar el entorno, publicar y verificar el deployment.
- Preservar historia, módulos, datos y capacidades existentes.
- No declarar una capacidad probada sin evidencia de ejecución real.
- HBG Authority es la autoridad soberana; HBG Core, Mediador y TERMINADOR interpretan y solicitan, pero no se conceden permisos a sí mismos.
- La entrega es integral: completar implementación, pruebas globales, correcciones, CI/build satisfactorios, punto de recuperación y después incorporación/publicación en Replit.

## Trabajo consolidado en GitHub

### HBG Authority y Code Tools

- HBG Authority mantiene separación entre uso normal y desarrollo; solo OWNER con sesión de desarrollo activa puede operar herramientas de desarrollo.
- Permisos explícitos y separados: inspección, modificación, gestión y ejecución. `universe.code.modify` no forma parte de los permisos automáticos del rol OWNER; exige concesión explícita.
- Concesiones de modificación vinculadas a OWNER, sesión de desarrollo, ruta exacta, motivo, expiración máxima de 15 minutos y revocación.
- Rutas API de concesiones registradas y validadas; se rechazan campos inesperados y permisos distintos del permiso crítico permitido.
- Code Tools ofrece listado/lectura, escritura y borrado de archivos regulares. Las mutaciones requieren contexto Authority y concesión exacta vigente.
- Protección contra traversal, symlinks, archivos/rutas de Authority, credenciales, tokens, claves, archivos de entorno, almacenes de secretos y Terraform state; límites de lectura/escritura.
- Operaciones de filesystem ancladas a descriptores de directorio validados mediante `/proc/self/fd` en Linux para reducir ataques TOCTOU por sustitución de directorios. Code Tools falla cerrado en plataformas no Linux para estas operaciones.
- Escritura atómica mediante archivo temporal y rename; auditoría de intención y resultado. Si la operación se ejecutó pero falla la auditoría posterior, la respuesta advierte que el recurso debe verificarse antes de reintentar.
- Ejecución de scripts/comandos del workspace permanece bloqueada hasta contar con aislamiento real de procesos. No habilitar por conveniencia.
- Pruebas de seguridad e integración cubren rutas protegidas, symlinks, traversal, escritura/borrado sin grant, grant exacto, revocación y acceso indebido.

### TERMINADOR

- Interpretación local y planificación con dependencias; las capacidades no conectadas se bloquean explícitamente.
- Cambios de estado del Application Registry usan propuesta, aprobación y ejecución explícita, con hash de propuesta, vinculación a OWNER/sesiones, expiración, consumo atómico y auditoría transaccional.
- Una autorización no puede reutilizarse ni aplicarse a otro recurso. Las aplicaciones críticas están protegidas.
- TERMINADOR distingue cambios del registro de aplicaciones de detener procesos o deployments: ejecutar un cambio de registro no detiene el proceso ni el deployment.
- Al buscar música, activa VIBRA si sus acciones no están montadas, reproduce el ID exacto de la pista verificada y bloquea resultados ambiguos o incompletos en vez de escoger arbitrariamente el primer resultado.
- UI no presenta tareas, cron, escaneo, reparación, backup o limpieza no conectados como operaciones reales.

### HBG Core, INSTINTO, VIBRA y voz

- HBG Core tiene memoria local persistente cuando el almacenamiento del navegador está disponible; valida datos serializables, maneja JSON corrupto/almacenamiento inaccesible y avisa cuando la persistencia no está disponible.
- HBG Core dispone de integración server-side opcional con OpenAI Responses API. La clave solo se lee del entorno del servidor; el request usa `store: false`, no declara tools y no puede ejecutar acciones. Sin clave, se mantiene el modo local.
- El modelo remoto predeterminado configurado es `gpt-6.2-astra`; `OPENAI_MODEL` permite sustituirlo. La clave no se ha creado ni compartido por este trabajo.
- Endpoints autenticados `/api/core/status` y `/api/core/chat`, validación estricta de mensajes y límite temporal por usuario.
- INSTINTO conserva notas, letras, proyectos y borradores en almacenamiento local del navegador, con autosave, respaldo/exportación e importación validada. No hay sincronización central PostgreSQL implementada.
- VIBRA mantiene reproducción de audio y biblioteca local, con controles de reproducción, shuffle, repeat-all, repeat-one, historial, playlists y preferencias persistentes.
- Los comandos de voz para shuffle/repeat están conectados a acciones reales de VIBRA.
- El comando de voz para reproducir una canción activa VIBRA cuando hace falta, usa el ID verificado del resultado de búsqueda y pide precisión si existen varias coincidencias.
- La voz sigue dependiendo de las APIs de reconocimiento/síntesis disponibles en el navegador; no debe presentarse como operador IA autónomo.
- Las operaciones de desarrollo desde el modo de uso normal se rechazan.

### Persistencia, Registry y PWA

- Migración PostgreSQL versionada `lib/db/migrations/0001_hbg_core.sql` para las tablas HBG.
- Runner de migraciones con transacción, bloqueo advisory, checksum SHA-256 inmutable y tabla de versiones. CI aplica la migración dos veces para comprobar idempotencia.
- El seed del Application Registry es idempotente y no sobrescribe estados existentes; HBG Core, HBG Authority y TERMINADOR están protegidos como aplicaciones críticas.
- `/api/healthz` verifica disponibilidad de tablas, versión de migración, columnas requeridas y presencia de los registros esenciales. No declara saludable un schema incompleto.
- La prueba de salud inicia el API contra PostgreSQL de prueba y cierra servidor y pool al terminar.
- Service worker con caché del shell y assets estáticos, navegación offline y exclusión de API/autenticación/respuestas dinámicas.
- Tests de PWA modelan Cache API/fetch y cubren precarga, limpieza selectiva de cachés, fallback offline y exclusión de endpoints API. No sustituyen pruebas en navegador/dispositivo real.

### CI y documentación de publicación

- Workflow `.github/workflows/hbg-universe-ci.yml`: Node.js 24, PostgreSQL 16 aislado, instalación frozen-lockfile, migración versionada, validación de scripts PWA/deployment, tests API y app, typecheck y build de producción.
- Runbook de publicación/rollback creado en `docs/deployment/HBG_REPLIT_RELEASE_RUNBOOK.md`.
- La CI valida una base temporal; no demuestra que la base PostgreSQL real de Replit esté provisionada, que la identidad OWNER exista o que los secretos estén configurados.

## Verificación registrada

Sobre el SHA `c80d9f3e8c4db5261766b059fa0e5d56a089e5ac`, GitHub Actions run `45071423768` terminó `success`:

- Instalación congelada de dependencias: aprobada.
- PostgreSQL 16 de prueba: disponible.
- Migración versionada aplicada dos veces: aprobada.
- Validación de service worker, manifest y script post-merge: aprobada.
- Tests API: aprobados, incluidos Authority/Code Tools, grants, TERMINADOR y health readiness.
- Tests de Universo HBG: aprobados, incluidos memoria, INSTINTO, VIBRA, TERMINADOR, voz y PWA.
- Typecheck del workspace: aprobado.
- Build de producción del workspace: aprobado.

## Estado real de publicación

El código de GitHub ha superado CI, pero Universo HBG todavía no debe declararse publicado ni listo para producción hasta completar las verificaciones del entorno real:

1. Respaldar la base PostgreSQL existente de Replit.
2. Comparar sus tablas, columnas y constraints con el schema y migración; la migración inicial crea tablas ausentes, pero no repara tablas preexistentes incompletas.
3. Confirmar que la identidad OWNER original existe y que los secretos `DATABASE_URL` y `HBG_OWNER_SECRET` están configurados sin exponer sus valores. No crear ni sustituir la identidad OWNER.
4. Configurar `OPENAI_API_KEY` solo si se desea habilitar conversación remota; sin ella Core debe funcionar en modo local.
5. Incorporar en Replit el SHA final validado, publicar y ejecutar smoke tests de salud, login OWNER, sesión de desarrollo, guards, grants, auditoría, Registry, Core, VIBRA, INSTINTO, TERMINADOR, voz y PWA.
6. Conservar el deployment anterior y el respaldo de DB para rollback.

No aplicar `drizzle push` en producción ni habilitar ejecución de scripts de Code Tools sin aislamiento real.

Este checkpoint documenta un estado de código con CI verde; no es una declaración de publicación ni de verificación del deployment real.
