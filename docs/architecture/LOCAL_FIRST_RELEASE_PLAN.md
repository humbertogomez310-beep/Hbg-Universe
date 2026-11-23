# Universo HBG — Plan de finalización Local-first

## Decisión arquitectónica

Universo HBG se termina bajo el enfoque Local-first ya acordado: la aplicación debe instalarse como PWA y ejecutar localmente todas las capacidades que no requieran autoridad central, con funcionamiento offline real para esas capacidades. La conexión online habilita servicios remotos; no es un requisito para abrir la aplicación ni para trabajar con datos locales.

Local-first no significa eliminar toda persistencia. La persistencia local principal debe usar IndexedDB para datos estructurados y archivos; localStorage queda reservado para preferencias pequeñas. No se debe confiar en el cliente para autorizar cambios privilegiados.

## Auditoría del estado actual (código de main)

### Ya existe
- PWA manifest en `artifacts/universo-hbg/public/manifest.webmanifest`.
- Service worker en `artifacts/universo-hbg/public/sw.js`.
- Registro del service worker en producción desde `src/main.tsx`.
- Caché del shell, manifest y recursos JS/CSS; fallback de navegación offline.
- Exclusión explícita de `/api/` del service worker: no almacena respuestas autenticadas ni datos dinámicos.
- INSTINTO conserva notas, letras, proyectos y borradores en localStorage y ofrece respaldo/exportación.
- VIBRA conserva preferencias y listas en localStorage y archivos de audio/metadatos en IndexedDB (`src/core/vibraDB.ts`).
- HBG Core conserva memoria y módulo activo localmente.
- TERMINADOR conserva parte del historial y configuración localmente.

### Brechas verificadas
- El service worker garantiza la apertura del shell offline, pero no demuestra que todos los flujos de cada módulo funcionen sin red.
- INSTINTO usa localStorage para colecciones y contenido; conviene migrar almacenamiento de contenido a IndexedDB, preservando importación y exportación.
- VIBRA usa IndexedDB para blobs de audio, pero necesita verificar recuperación, límites de cuota, errores de transacción y comportamiento offline en navegador real.
- HBG Core consulta `/api/core/status` y `/api/core/chat` para IA remota. Los comandos locales pueden continuar sin API; la IA remota debe indicar claramente que no está disponible offline.
- La sesión OWNER se valida exclusivamente en el servidor (`/api/auth/me`, login y logout). Debe seguir fallando cerrada cuando no hay red; nunca se sustituye por una bandera local.
- Las autorizaciones de TERMINADOR se gestionan en el servidor. Propuestas, aprobaciones y ejecuciones privilegiadas requieren conexión y validación de HBG Authority; no se deben simular ni encolar como si estuvieran aprobadas offline.
- No existe evidencia suficiente de sincronización multi-dispositivo implementada. No debe anunciarse como función disponible hasta construirla y probarla.

## Contrato de funcionamiento

1. La PWA debe abrir el shell y los recursos versionados sin conexión después de una primera instalación/carga online correcta.
2. INSTINTO debe permitir crear, editar, consultar, organizar, exportar e importar contenido local offline.
3. VIBRA debe permitir acceder a la biblioteca local, metadatos, playlists y archivos de audio disponibles en el dispositivo offline.
4. HBG Core debe mantener disponibles sus comandos locales, memoria local y navegación de módulos offline.
5. TERMINADOR puede mostrar estado local e historial local offline, pero las acciones que cambian el estado del ecosistema, permisos, código o aplicaciones quedan bloqueadas hasta que HBG Authority confirme autorización online.
6. La autenticación OWNER y los controles de autoridad nunca se infieren desde almacenamiento del navegador.
7. La aplicación debe mostrar el estado de conectividad y diferenciar capacidad local disponible de servicio remoto no disponible.
8. No debe cachearse ninguna respuesta autenticada, secreto, sesión, API privada ni contenido que pertenezca a otro usuario.
9. Los datos locales deben poder exportarse y restaurarse; una actualización del service worker no puede borrar datos de usuario.
10. No se promete sincronización online/multi-dispositivo hasta que exista una cola de cambios, resolución de conflictos, identidad/autorización y pruebas de recuperación.

## Orden de trabajo

### Etapa 1 — PWA y diagnóstico de offline
- Verificar manifest, iconos, scope, start_url, actualización del service worker y caché de assets con nombres versionados.
- Añadir pruebas de offline para rutas profundas, recarga, recursos estáticos, actualización y ausencia de interceptación de API.
- Probar en navegador real con DevTools offline y una instalación PWA; el harness de CI no sustituye esta prueba.

### Etapa 2 — Persistencia local
- Introducir un almacén IndexedDB versionado compartido para datos de INSTINTO y preferencias estructuradas donde sea apropiado.
- Migrar datos existentes de localStorage sin sobrescribir ni borrar el origen hasta verificar la copia.
- Mantener exportación/importación con validación de esquema y recuperación ante datos dañados.
- Manejar cuota agotada, almacenamiento denegado y errores de transacción con mensajes visibles.

### Etapa 3 — Contrato offline por módulo
- INSTINTO: CRUD completo offline y respaldo/restauración.
- VIBRA: biblioteca, audio local, metadatos, playlists y preferencias offline.
- HBG Core: comandos locales y memoria offline; IA remota degradada con mensaje explícito.
- TERMINADOR: lectura de información local; mutaciones privilegiadas deshabilitadas offline.

### Etapa 4 — Liberación
- CI: typecheck, tests, build, análisis de artefactos PWA y pruebas del almacén local.
- Prueba manual de instalación y operación offline en al menos un navegador de escritorio y uno móvil.
- Confirmar que ningún flujo privilegiado se habilita por pérdida de conexión o estado local falsificado.
- Publicar el frontend PWA como sitio estático desde GitHub; desplegar backend solo para capacidades remotas que realmente se necesiten. El alojamiento de la PWA no debe depender de una base de datos ni de un proceso Node permanente.

## Criterio de finalización

No declarar Universo HBG terminado solo porque carga offline. La aceptación exige que los módulos locales puedan completar sus tareas offline, que la persistencia sobreviva reinicios/actualizaciones, que las capacidades remotas se degraden con claridad y que HBG Authority siga siendo la única autoridad para acciones privilegiadas.
