# Checkpoint oficial — Finalización Universo HBG Local-first
**Fecha:** 2026-11-22  
**Estado:** trabajo pausado por solicitud del usuario; continuar desde este checkpoint.

## 1. Decisión arquitectónica que se retoma

La dirección oficial de Universo HBG es la arquitectura **Local-first**, acordada desde el diseño original. No se debe sustituir por una arquitectura centrada en un servidor permanente.

- La PWA es el formato de instalación y distribución.
- Local-first es el modelo de funcionamiento y persistencia.
- Offline permite completar las operaciones locales sin conexión.
- Online habilita servicios remotos que realmente lo necesitan.
- El backend y los servicios centrales son opcionales para la experiencia local, pero siguen siendo obligatorios para autoridad central, identidad OWNER, auditoría centralizada, IA remota y operaciones privilegiadas.
- Las aplicaciones del Universo HBG deben poder operar independientemente en las funciones que sean técnicamente locales.

No se debe volver a presentar PWA/offline como una arquitectura nueva: es la dirección original del proyecto.

## 2. Fuente oficial y estado de GitHub

- Repositorio: `humbertogomez310-beep/Hbg-Universe`
- Rama principal: `main`
- SHA de `main` en la comparación más reciente: `77ae22b2432fe5fa435b485454c6b06b8dff7a31`
- Rama de trabajo Local-first: `local-first/pwa-completion`
- Último SHA confirmado por CI: `bba06966597bd7f82ad2c24993b11f365400b060`
- Comparación: 14 commits por delante de `main`, 0 por detrás.
- Rama: https://github.com/humbertogomez310-beep/Hbg-Universe/tree/local-first/pwa-completion

**Protección:** `main` no se ha modificado, no se ha abierto PR, no se ha hecho merge y no se ha publicado una versión nueva.

La rama anterior `migration/cloud-hosting-pilot` sigue siendo una línea de trabajo separada. No debe confundirse con la rama Local-first ni integrarse automáticamente.

## 3. Trabajo realizado en la rama Local-first

### Documentación
- `docs/architecture/LOCAL_FIRST_RELEASE_PLAN.md`: contrato arquitectónico, estado por módulo, brechas, orden de trabajo y criterios de aceptación.
- `docs/deployment/HBG_PWA_STATIC_DEPLOYMENT.md`: guía para publicación estática de la PWA mediante Cloudflare Pages, con el API remoto deshabilitado en el build Local-first.

### Configuración de publicación PWA
- `artifacts/universo-hbg/public/_headers`: encabezados de seguridad y políticas de caché para alojamiento estático.
- `artifacts/universo-hbg/public/manifest.webmanifest`: se declararon iconos de 192x192 y 512x512 utilizando el icono SVG HBG existente.
- Se documentó Cloudflare Pages como primer destino de publicación estática. No se ha creado ni configurado una cuenta, proyecto o deployment.

### Control explícito de API remota
- `artifacts/universo-hbg/src/core/apiConfig.ts`: interruptor de build `VITE_HBG_API_ENABLED`; por defecto mantiene habilitada la API para no cambiar publicaciones server-backed existentes. El build Local-first estático usa `false`.
- `artifacts/universo-hbg/src/core/apiConfig.test.mjs`: pruebas del comportamiento por defecto y de la desactivación explícita.
- `artifacts/universo-hbg/src/core/ownerSession.ts`: login y comprobación OWNER fallan cerrados cuando la API remota está deshabilitada; logout no depende de un endpoint inexistente.
- `artifacts/universo-hbg/src/modules/terminadorRequest.ts`: operaciones protegidas de TERMINADOR no se envían sin API; devuelve error explícito de API deshabilitada.
- `artifacts/universo-hbg/src/modules/universo.tsx`: no consulta el estado remoto de HBG Core cuando la API está deshabilitada y explica que la IA remota no está disponible, conservando las capacidades locales.
- `artifacts/universo-hbg/package.json`: se añadió la prueba de configuración al conjunto de tests.

### CI
- `.github/workflows/hbg-universe-ci.yml`: se habilitó CI para ramas `local-first/**` y se añadió una etapa para compilar la PWA estática y verificar la presencia de `index.html`, `sw.js`, `manifest.webmanifest` y `_headers`.

## 4. Hallazgos confirmados en el código existente

- Ya existe un manifest PWA.
- Ya existe un Service Worker que cachea el shell, manifest y recursos JS/CSS, y utiliza fallback de navegación offline.
- El Service Worker excluye `/api/` para no cachear respuestas dinámicas/autenticadas.
- INSTINTO conserva contenido en almacenamiento local y cuenta con respaldo/exportación.
- VIBRA utiliza IndexedDB para blobs de audio y almacenamiento local para preferencias/listas.
- HBG Core conserva memoria y módulo activo localmente; tiene capacidades locales y servicios remotos de IA/estado.
- TERMINADOR conserva parte de historial/configuración local, pero las operaciones privilegiadas dependen de HBG Authority en el servidor.
- La sesión OWNER se valida en el servidor. No se debe reemplazar por un booleano o sesión inventada en el navegador.
- No hay evidencia suficiente de sincronización multi-dispositivo completa; no anunciarla como disponible.

Estos hallazgos son una auditoría inicial de código, no una certificación de funcionamiento offline integral.

## 5. Resultado de CI más reciente

Ejecución:
https://github.com/humbertogomez310-beep/Hbg-Universe/actions/runs/45093127617

- Run ID: `45093127617`
- Job ID: `137426956522`
- Commit probado: `bba06966597bd7f82ad2c24993b11f365400b060`
- Resultado general: **failure**.
- Instalación de dependencias: success.
- Provisionamiento de esquema PostgreSQL temporal de CI: success.
- Validación sintáctica del Service Worker, parseo del manifest y scripts: success.
- Tests de API: success.
- Tests de Universo HBG: 39 pasaron, 2 fallaron.
- Typecheck y builds no se ejecutaron porque el job se detuvo en el conjunto de tests.

**Causa precisa de los dos fallos:** Node 24 ejecuta los tests ESM y no resuelve la importación sin extensión `../core/apiConfig` desde `src/modules/terminadorRequest.ts`. Error `ERR_MODULE_NOT_FOUND`. Los tests afectados fueron:
- `src/modules/terminadorExecution.test.mjs`
- `src/modules/terminadorRequest.test.mjs`

El siguiente trabajo técnico debe corregir la resolución/importación para el entorno Node de tests (por ejemplo, extensión explícita compatible con TypeScript/Vite o una estructura de módulo que Node pueda resolver), volver a ejecutar CI y revisar los siguientes pasos. No declarar CI verde hasta que finalice correctamente.

Una ejecución anterior de la rama `migration/cloud-hosting-pilot` tuvo otro fallo independiente de Docker build (`TS6305` en la compilación de dependencias internas). Ese problema pertenece al piloto de contenedor y no es el fallo de la rama Local-first actual.

## 6. Próximos pasos al reanudar

1. Corregir el fallo ESM de `apiConfig` y verificar que los dos tests de TERMINADOR vuelvan a pasar.
2. Ejecutar CI completo: API tests, tests de aplicación, typecheck, build del workspace y build estático PWA.
3. Revisar el artefacto compilado para confirmar que el build estático no contiene llamadas remotas inesperadas ni secretos.
4. Auditar y completar pruebas offline por módulo:
   - INSTINTO: crear, editar, consultar, importar/exportar offline.
   - VIBRA: biblioteca, audio local, metadatos, playlists y preferencias offline.
   - HBG Core: memoria, comandos y navegación local; mensaje claro para IA remota no disponible.
   - TERMINADOR: lectura local permitida; toda mutación privilegiada permanece bloqueada sin autorización online de HBG Authority.
5. Revisar persistencia real, manejo de cuota/errores y recuperación tras reinicio y actualización del Service Worker.
6. Hacer pruebas manuales de instalación y uso offline en navegador de escritorio y móvil. CI por sí solo no prueba el comportamiento de dispositivos.
7. Solo después, preparar deployment de prueba de la PWA en Cloudflare Pages. No publicar en producción ni cambiar `main` sin revisión y autorización.
8. Evaluar posteriormente servicios remotos opcionales. No implementar sincronización multi-dispositivo hasta diseñar cola de cambios, identidad, autorización y resolución de conflictos.

## 7. Restricciones que siguen vigentes

- No activar Replit Core ni pagar servicios para poder continuar.
- No modificar `main`, hacer merge o publicar sin revisión.
- No tocar la base de datos real, datos de producción ni migraciones.
- No copiar la base de desarrollo sobre producción.
- No crear ni modificar secretos o credenciales.
- No desplegar servicios ni conectar cuentas externas sin autorización explícita.
- Mantener HBG Authority como única autoridad para permisos y acciones privilegiadas.
- No declarar terminado el producto solo porque la PWA abre offline.
- No afirmar sincronización, persistencia integral ni seguridad no probadas.

## 8. Punto exacto para continuar

Retomar en la rama `local-first/pwa-completion`, desde el commit `bba06966597bd7f82ad2c24993b11f365400b060` (o el HEAD posterior si el checkpoint se acaba de registrar), comenzando por corregir la importación ESM de `apiConfig` y hacer que CI quede verde.

**Objetivo final:** concluir Universo HBG siguiendo la arquitectura Local-first original: PWA instalable, persistencia local confiable, funciones locales operativas offline, capacidades remotas claramente delimitadas y HBG Authority protegiendo toda operación privilegiada.
