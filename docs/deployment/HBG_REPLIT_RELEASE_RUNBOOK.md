# Universo HBG — runbook de liberación en Replit

Este procedimiento solo se ejecuta después de que GitHub tenga un HEAD final con CI verde. GitHub es la fuente de código; Replit se usa para incorporar ese commit, configurar el entorno, publicar y verificar el deployment.

## 1. Identificar y proteger el release

1. Registrar el SHA exacto de `replit-agent` que pasó CI.
2. Conservar el deployment de Replit que está activo antes de cambiarlo; debe seguir disponible para rollback.
3. Crear un respaldo verificable de PostgreSQL antes de cualquier migración.
4. Registrar el estado actual de las tablas, columnas, constraints e identidad OWNER. No recrear, sustituir ni desactivar la identidad OWNER existente.

## 2. Variables y secretos

Configurar desde el panel de Secrets de Replit, nunca en archivos versionados:

- `DATABASE_URL`: conexión PostgreSQL de producción.
- `HBG_OWNER_SECRET`: secreto bootstrap del OWNER existente, con al menos 16 caracteres.
- `OPENAI_API_KEY`: opcional; habilita conversación remota de HBG Core.
- `OPENAI_MODEL`: opcional; si no se define, la aplicación usa el modelo predeterminado configurado en el servidor.

No imprimir, copiar a logs, incluir en capturas ni compartir valores secretos. Si no se configura `OPENAI_API_KEY`, HBG Core debe continuar en modo local y comunicar que la IA remota no está configurada.

## 3. Incorporar y preparar el código

1. Incorporar en Replit el commit exacto validado de GitHub; no usar Replit Agent para reescribir ni adaptar el código.
2. Confirmar que el workspace corresponde al mismo SHA.
3. Ejecutar `pnpm install --frozen-lockfile`.
4. Comparar el esquema PostgreSQL existente con `lib/db/src/schema/hbg.ts` y `lib/db/migrations/0001_hbg_core.sql`.
5. Si la base ya contiene tablas HBG, comprobar columnas y constraints antes de migrar. La migración inicial crea tablas ausentes; no repara automáticamente tablas preexistentes incompletas.
6. Solo después de verificar el respaldo y la compatibilidad, ejecutar `pnpm --filter @workspace/db migrate`. No usar `drizzle push` en producción.

## 4. Smoke tests obligatorios

- `GET /api/healthz`: debe responder 200 únicamente cuando las tablas, columnas requeridas, migración versionada y seed del registry estén disponibles.
- `GET /api/auth/me`: sin sesión debe indicar no autenticado.
- Login OWNER con la credencial administrada en Secrets; verificar que corresponde a la identidad OWNER preexistente.
- Iniciar y cerrar una sesión de desarrollo; comprobar expiración y revocación.
- Confirmar que usuarios normales no pueden acceder a rutas de desarrollo.
- Comprobar que Code Tools permite listar/leer solo con permiso de inspección y que escribir/eliminar exige OWNER, sesión de desarrollo y concesión exacta, temporal y no revocada.
- Confirmar que los cambios de Code Tools dejan auditoría de intención y resultado.
- Verificar que `/api/tools/run` permanece bloqueado: no habilitar ejecución de scripts hasta disponer de aislamiento real de procesos.
- En TERMINADOR, probar consulta del registry y flujo propuesta → aprobación → ejecución para un registro no protegido. Confirmar que una autorización no puede reutilizarse ni aplicarse a otro recurso.
- En HBG Core, probar comandos locales y, si se configuró la clave, una conversación remota. Confirmar que el proveedor no recibe herramientas ni permiso para ejecutar acciones.
- Probar VIBRA con audio real: reproducción, pausa, siguiente/anterior, shuffle, repeat-all, repeat-one, playlists y comandos de voz.
- Probar INSTINTO: crear/editar/eliminar notas, letras y proyectos; exportar e importar un backup.
- Probar instalación PWA, navegación online y carga del shell offline en un navegador/dispositivo real. La prueba simulada de CI no sustituye esta verificación.
- Verificar navegación móvil/escritorio, persistencia y consola del navegador sin errores críticos.

## 5. Cierre o rollback

1. Guardar SHA desplegado, URL, hora, resultado de smoke tests y referencia del deployment.
2. Si falla health, autenticación, autoridad, persistencia o cualquier flujo crítico, no declarar release satisfactorio.
3. Restaurar el deployment anterior si la versión nueva no supera las verificaciones.
4. No revertir migraciones manualmente ni borrar datos. Para volver atrás en PostgreSQL, usar el respaldo verificado y un procedimiento de recuperación revisado.
5. Mantener el commit fallido y sus logs para corregir en GitHub; no hacer hotfix directo en Replit.

## Límites de seguridad que no se deben relajar

- No conceder permisos a TERMINADOR, HBG Core o al Mediador IA por su propia interpretación.
- No activar comandos o scripts del workspace sin aislamiento real.
- No aplicar migraciones a una DB existente sin respaldo y comparación del esquema.
- No crear una nueva identidad OWNER para resolver un problema de login.
- No declarar el deployment listo solo porque GitHub CI esté verde.
