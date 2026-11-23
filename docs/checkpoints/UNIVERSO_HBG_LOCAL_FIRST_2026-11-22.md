# Checkpoint oficial — Finalización Universo HBG Local-first
**Fecha de actualización:** 2026-11-23  
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
- Último SHA confirmado por CI: `024ed49c74be1f1188bb59c340cc1b2ab5a24e70`
- Comparación: La rama está por delante de `main` y no tiene commits pendientes de incorporar desde `main`.
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


## 5.1. Verificación posterior — 2026-11-23

Ejecución CI aprobada:
https://github.com/humbertogomez310-beep/Hbg-Universe/actions/runs/45104899239

- Run ID: `45104899239`
- Job ID: `137463810909`
- Commit probado: `024ed49c74be1f1188bb59c340cc1b2ab5a24e70`
- Resultado: **success**.
- API server tests: success.
- Tests de Universo HBG: success.
- Typecheck del workspace: success.
- Build de producción: success.
- Build estático Local-first PWA: success.
- Se corrigió el import ESM de TERMINADOR agregando la extensión explícita `.ts` a `apiConfig`.
- El Service Worker ahora precarga también `/icons/hbg.svg`; su prueba automatizada verifica que el icono quede disponible offline.
- CI comprueba que los iconos declarados por el manifest existan en los recursos públicos.
- Se eliminó una ejecución duplicada de migraciones en el workflow de CI.
- VIBRA ahora espera a que la transacción IndexedDB termine antes de resolver la operación; los errores y abortos cierran la conexión y rechazan la operación.

Advertencia no bloqueante del build: el bundle JavaScript principal supera 500 kB minificado (aprox. 671 kB; 170 kB gzip). No se realizó code splitting porque antes hay que garantizar que los módulos diferidos también queden disponibles offline. Conviene medir el arranque en el teléfono antes de decidir la optimización.

## 5.2. Pendientes para probar en dispositivo

- No hay deployment nuevo. El deployment antiguo de Replit sigue sin ser fuente válida para probar esta rama.
- Aún no se han realizado pruebas manuales de instalación, uso offline, persistencia tras reinicio ni actualización del Service Worker en un teléfono real.
- INSTINTO todavía utiliza localStorage para colecciones y contenido; la migración a IndexedDB sigue pendiente. El módulo cuenta con respaldo/exportación, pero no se ha certificado el comportamiento con grandes volúmenes o cuotas agotadas.
- VIBRA usa IndexedDB para archivos de audio; su operación real debe comprobarse en el dispositivo, incluida recuperación y cuota.
- La PWA requiere un hosting HTTPS de vista previa. Vercel fue sugerido como vía de publicación de preview; no está conectado ni se ha creado ningún deployment.
- Antes de instalar, confirmar si el teléfono es Android o iPhone para aplicar el flujo correcto y revisar compatibilidad de iconos/instalación.
- No activar Replit Core ni pagar servicios. No publicar producción, modificar `main`, fusionar ramas, tocar DB real o configurar secretos.

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

Retomar en la rama `local-first/pwa-completion`, desde el commit `024ed49c74be1f1188bb59c340cc1b2ab5a24e70` (o el HEAD posterior si el checkpoint se acaba de registrar). La importación ESM de `apiConfig` está corregida y CI está verde; el siguiente objetivo es preparar una vista previa HTTPS para instalación móvil y ejecutar pruebas reales en el teléfono.

**Objetivo final:** concluir Universo HBG siguiendo la arquitectura Local-first original: PWA instalable, persistencia local confiable, funciones locales operativas offline, capacidades remotas claramente delimitadas y HBG Authority protegiendo toda operación privilegiada.


## 5.3. Verificación PWA multiplataforma — 2026-11-23

Ejecución CI aprobada:
https://github.com/humbertogomez310-beep/Hbg-Universe/actions/runs/45105401573

- Run ID: `45105401573`
- Job ID: `137465403271`
- Commit probado: `0c47859c0939fbc28b0ec870395877697f41900d`
- Resultado: **success**.
- Se completaron correctamente todos los pasos: instalación de dependencias, provisionamiento del esquema aislado de pruebas, validación de scripts, tests del API, tests de Universo HBG, typecheck, build de producción y build estático Local-first PWA.
- Cambios asociados al commit: icono Apple Touch PNG, referencia desde HTML, viewport sin bloqueo de zoom, actualización de versión del Service Worker y comprobaciones de los recursos de iconos en CI.
- Comparación Git: `local-first/pwa-completion` está 23 commits por delante de `main` y 0 commits por detrás. SHA actual: `0c47859c0939fbc28b0ec870395877697f41900d`; SHA de `main`: `77ae22b2432fe5fa435b485454c6b06b8dff7a31`.
- `main` continúa intacta; no se abrió PR, no hubo merge y no se publicó deployment.

**Alcance de esta evidencia:** CI demuestra que los tests y builds automatizados terminaron correctamente. No demuestra instalación ni comportamiento real en Android, iOS o escritorio. Tampoco certifica persistencia offline integral por módulo.

## 5.4. Siguiente trabajo técnico

1. Continuar auditoría offline por módulo, empezando por INSTINTO (actualmente conserva colecciones/contenido en localStorage) y validando cuotas, persistencia y recuperación.
2. Validar VIBRA IndexedDB en dispositivo, incluyendo lectura/escritura, audio local, metadatos y recuperación tras reinicio.
3. Revisar HBG Core y TERMINADOR offline: las funciones locales deben seguir disponibles y las operaciones privilegiadas deben permanecer bloqueadas sin autorización online de HBG Authority.
4. Preparar una vista previa HTTPS estática aislada para pruebas de instalación. Cloudflare Pages o Vercel son opciones; todavía no hay proyecto ni deployment configurado.
5. Realizar primero prueba real en Android; después iPhone Safari y escritorio. Comprobar instalación, apertura, persistencia, modo avión, reinicio y actualización del Service Worker.
6. No crear deployment, conectar proveedor externo, modificar `main`, fusionar, tocar DB ni activar servicios de pago sin autorización explícita. No activar Replit Core ni incurrir en gastos.
