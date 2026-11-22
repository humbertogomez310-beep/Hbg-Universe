# Universo HBG — checkpoint de continuidad
Fecha: 2026-11-22
Rama de trabajo: `replit-agent`
HEAD validado de este checkpoint: `38d8fc44d7b361bc671b97db8e103ccbfd05e346`
Base de esta tanda: `6ec70948e69e5b2e82f92564e0fd317484dc9b24`
Avance desde esa base: 140 commits confirmados en GitHub.

## Orden de trabajo que permanece vigente
- GitHub es la fuente única de desarrollo y finalización. No adaptar la aplicación a las limitaciones del workspace de Replit.
- Replit se utilizará después para incorporar la versión terminada, publicar y verificar el deployment.
- Preservar historia, módulos, datos y capacidades existentes.
- No declarar una capacidad probada sin evidencia de ejecución real.
- Mantener HBG Authority como autoridad soberana; el Mediador/TERMINADOR interpreta y solicita, pero no se concede permisos a sí mismo.
- Una sola entrega integral: terminar implementación, ejecutar pruebas globales, corregir fallos, obtener build y CI satisfactorios, preparar recuperación y luego pasar a Replit/publicación.

## Trabajo incorporado a GitHub en esta tanda
### HBG Authority y Code Tools
- CI de GitHub Actions añadido en `.github/workflows/hbg-universe-ci.yml`: Node.js 24 (alineado con `.replit`), PostgreSQL 16 de prueba, instalación congelada, provisionamiento de schema, validación del service worker/manifest y del script post-merge, tests API y aplicación, typecheck y build.
- Pool PostgreSQL con límites explícitos de conexión, tiempo de conexión y tiempo de inactividad.
- Script post-merge con protección para impedir `drizzle push` en entorno marcado como producción; CI valida su sintaxis.
- Rutas de concesiones de permisos registradas.
- Code Tools con inspección/listado, escritura y borrado de archivos; validación de rutas, traversal, symlinks, archivos y segmentos protegidos, límites de tamaño, `O_NOFOLLOW`, validación de directorio padre y protección explícita de archivos críticos.
- Tests de seguridad para alias internos de symlink, traversal, archivos de Authority protegidos y listado de directorios permitidos.
- Bloqueo de inspección, escritura y borrado de almacenes de credenciales y secretos comunes (por ejemplo `.aws`, `.docker`, `.kube`, `.npmrc`, `.netrc`, claves, tokens, service accounts y archivos Terraform state), con protección insensible a mayúsculas/minúsculas y pruebas negativas.
- Escritura/borrado requieren contexto HBG Authority y concesión específica de `universe.code.modify`; las operaciones dejan auditoría de intención y resultado.
- Los scripts de workspace siguen sujetos a la política de ejecución segura y no deben habilitarse por conveniencia.
- El endpoint de salud comprueba PostgreSQL y la presencia de las tablas esenciales de Authority/Registry; no informa saludable si falta el schema.

### TERMINADOR
- Autorizaciones de cambio del registro con flujo de propuesta, aprobación y ejecución explícita en pasos separados.
- Ejecución transaccional de cambio de estado de registro y auditoría; el cambio de registro no equivale a detener procesos ni deployments.
- UI ajustada para no presentar tareas/cron, escaneo, reparación, backup o limpieza no conectados como si fueran operaciones reales.
- Exportación de logs implementada.
- Integración de tareas musicales con acciones reales registradas en HBG Core/VIBRA.
- La ruta de desarrollo normal sigue separada del modo de uso; acciones de desarrollo no se ejecutan desde TERMINADOR de uso normal.

### HBG Core, INSTINTO, VIBRA y voz
- Memoria de HBG Core con persistencia local comprobable, validación de datos JSON serializables, manejo de almacenamiento inaccesible/JSON corrupto y aviso visible cuando solo dura la sesión.
- Memoria de TERMINADOR con validación de claves/valores, límites de entradas y tamaño, rechazo de datos sensibles, rollback en memoria cuando falla la persistencia y tests dedicados.
- Restauración del estado de ánimo guardado al iniciar Core.
- INSTINTO con respaldo/exportación e importación local, validación de contenido y pruebas asociadas.
- VIBRA con selección de reproducción determinista para shuffle/repeat, historial de shuffle alineado con reproducción, casos de pista única y modos repeat; controles y acciones conectados.
- Comandos de voz para shuffle/repeat conectados a las acciones de VIBRA y con pruebas de parser/ejecución.
- Comandos globales de voz para saludo, capacidades disponibles, información de módulos y navegación entre UNIVERSO, INSTINTO y VIBRA; la orden de crear canción abre INSTINTO e informa que no ha creado nada. Las operaciones de desarrollo desde modo de uso se rechazan. Tests de integración del ejecutor de voz incluidos en la suite.
- Manejo de error de Web Audio para que un fallo al crear el grafo de audio no silencie la reproducción base.

### PWA
- Service worker con caché de shell y assets estáticos, navegación offline y exclusión explícita de API/autenticación/respuestas dinámicas.
- Manifest y service worker incluidos en validaciones CI.
- Pruebas de comportamiento del service worker: precarga del shell/manifest/assets, limpieza selectiva de cachés HBG, fallback offline de navegación y exclusión de endpoints API. Los tests modelan Cache API y fetch; no sustituyen la prueba en navegador/dispositivo real.

### Persistencia PostgreSQL y HBG Core conversacional
- Migración inicial versionada `lib/db/migrations/0001_hbg_core.sql` para las siete tablas HBG (usuarios, sesiones, sesiones de desarrollo, auditoría, autorizaciones TERMINADOR, concesiones de permisos y registro de aplicaciones).
- Runner `lib/db/migrate.mjs` con transacción por migración, bloqueo advisory, checksum SHA-256 inmutable y tabla de versiones. El comando de workspace es `pnpm --filter @workspace/db migrate`.
- CI ya no usa `drizzle push` para provisionar su base temporal: aplica la migración versionada dos veces, comprobando aplicación e idempotencia.
- HBG Core cuenta con integración opcional y del lado del servidor con OpenAI Responses API. Usa `OPENAI_API_KEY` solo como secreto del servidor y `OPENAI_MODEL` opcional (default `gpt-6.2-astra`); limita mensajes y contexto, fija `store: false`, no declara tools y no puede ejecutar acciones. Sin clave, Core conserva su modo local.
- Nuevas rutas autenticadas `/api/core/status` y `/api/core/chat`, con límite temporal por usuario, validación estricta de mensajes y manejo seguro de errores del proveedor.
- Registry de aplicaciones: seed idempotente al iniciar API, sin sobrescribir estados existentes; HBG Core, HBG Authority y TERMINADOR se protegen como aplicaciones críticas. Se añadieron pruebas de seed y protección.
- La configuración del proveedor remoto es opcional: el chat no estará habilitado hasta configurar la variable secreta en el deployment. No se ha creado ni compartido ninguna clave API.
- La migración inicial crea tablas ausentes, pero no repara columnas/constraints de tablas preexistentes; una DB ya existente requiere inspección y reconciliación antes de aplicarla.

## Estado de verificación al guardar este checkpoint
- HEAD validado: `38d8fc44d7b361bc671b97db8e103ccbfd05e346`.
- GitHub Actions run `45069804352` terminó `success` sobre exactamente ese HEAD.
- Node.js 24: instalación congelada, PostgreSQL 16 aislado y migración de schema versionada aplicada dos veces correctamente.
- Tests API: aprobados, incluidos Authority/Code Tools, permisos de ruta exacta, TERMINADOR, proveedor remoto de Core y bootstrap/protección del registry.
- Tests de aplicación Universo HBG: aprobados, incluidos INSTINTO, VIBRA, voz, memoria y PWA/offline.
- Typecheck del workspace: aprobado.
- Build de producción del workspace: aprobado.
- Validación sintáctica de service worker, manifest y script post-merge: aprobada.
- La CI valida una base PostgreSQL temporal; no demuestra que la base de datos de producción esté provisionada, que la migración sea compatible con su estado actual ni que exista el registro OWNER esperado.
- El proveedor remoto de HBG Core es opcional y no está activo hasta que el deployment tenga `OPENAI_API_KEY` configurada.
- No se ha ejecutado una prueba integral de producción en el deployment de Replit.
- No declarar la publicación verificada basándose únicamente en el build de GitHub.
- El repositorio sigue sin estar listo para declarar publicación: falta inspección/reconciliación de DB real, verificar secretos y OWNER, incorporar el commit validado en Replit y hacer smoke tests del deployment.

## Siguientes pasos obligatorios
1. Revisar con el propietario el estado real de PostgreSQL del deployment existente, hacer respaldo y comparar tablas/columnas/constraints con el schema Drizzle y la migración inicial; no aplicar la migración a ciegas sobre una DB preexistente.
2. Confirmar la existencia de la identidad OWNER original y la disponibilidad de `HBG_OWNER_SECRET` sin exponer secretos; no crear ni sustituir identidades OWNER.
3. Hacer revisión final de la integración remota de Core, costos/límites del proveedor y experiencia cuando la clave no esté configurada; probar con una clave configurada solo durante la verificación del deployment.
4. Completar las brechas funcionales restantes de UI/API y persistencia, sin inventar capacidades ni reemplazar módulos existentes. Mantener deshabilitada la ejecución de scripts hasta disponer de aislamiento real.
5. Ejecutar CI sobre el HEAD final y conservar el resultado verde exacto.
6. Crear tag/punto de recuperación final y registrar el commit validado.
7. Solo entonces incorporar en Replit, configurar variables y DB/schema, publicar y ejecutar smoke tests de `/api/healthz`, login OWNER, sesión de desarrollo, guards, chat de Core (si se configura), Registry, módulos, voz y PWA en navegador/dispositivo. Conservar el deployment anterior para rollback.

Este archivo es un checkpoint de continuidad, no una declaración de finalización ni de publicación.
