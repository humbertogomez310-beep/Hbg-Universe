# UNIVERSO HBG — HOJA MAESTRA Y CHECKPOINT OFICIAL DE CONTINUIDAD

**Versión:** 2.0 — auditoría y consolidación del 25 de noviembre de 2026  
**Estado del documento:** checkpoint oficial de continuidad propuesto sobre el código de producción auditado.  
**Repositorio:** https://github.com/humbertogomez310-beep/Hbg-Universe  
**Rama de referencia de producción:** deploy/pwa-render  
**Commit exacto de producción auditado:** ad70d37ae71da09620b5b0cb1d6decef536270bb  
**Deploy Render:** dep-dc3hute0tbcc73detto0 — LIVE  
**URL pública:** https://universo-hbg-pwa-public.onrender.com

---

## 0. Cómo leer este documento

Este documento sustituye los resúmenes parciales como referencia principal de continuidad, pero **no invalida las decisiones oficiales anteriores** ni convierte planes en funcionalidades terminadas.

Cada afirmación debe interpretarse con una de estas categorías:

- **VERIFICADO EN CÓDIGO:** localizado directamente en el repositorio y en la rama indicada.
- **VERIFICADO EN INFRAESTRUCTURA:** confirmado por GitHub o Render.
- **EVIDENCIA HISTÓRICA:** resultado de una ejecución o conversación anterior; no equivale a una prueba actual.
- **PENDIENTE DE PRUEBA:** el código existe, pero no hay evidencia suficiente de ejecución real.
- **NO DESPLEGADO:** el código existe, pero no está conectado a la infraestructura pública actual.
- **NO IMPLEMENTADO / NO LOCALIZADO:** no se encontró una implementación funcional en la rama auditada.
- **BLOQUEADO POR SEGURIDAD O DECISIÓN DEL OWNER:** no se debe activar ni modificar sin cumplir el gate indicado.

La auditoría cubrió el repositorio y su árbol de archivos, documentación de arquitectura y checkpoints, ramas y PR relevantes de GitHub, configuración y deployments de Render, paquetes y scripts de pruebas, PWA, HBG Core, voz, VIBRA, INSTINTO, API server, HBG Authority, Code Tools y Terminador.

**Límite de la auditoría:** no se tuvo acceso a una sesión física del teléfono, a una base de datos de producción, a secretos ni a una sesión OWNER real. Tampoco se pudo cargar la URL pública desde el lector web disponible. Por eso no se certifica visualmente el dispositivo ni el backend real.

## 1. Estado ejecutivo

### Resultado global

**Universo HBG tiene una beta PWA pública desplegada y una base de código amplia; todavía no tiene una certificación integral de estabilidad del ecosistema.**

| Área | Estado al 25-11-2026 |
|---|---|
| PWA pública de Universo HBG | **LIVE en Render** |
| Nueva portada cinematográfica V2 | **Desplegada; prueba visual en teléfono pendiente** |
| Versión de producto | HBG 0.1 |
| Service Worker | hbg-pwa-v7 |
| HBG Core local | Implementado en frontend; pruebas automatizadas presentes |
| HBG Voice / LINGUA | Implementación parcial; depende del navegador y de interacción del usuario |
| VIBRA | Reproductor local con funciones musicales; Auto DJ inteligente completo pendiente |
| INSTINTO | Notas, letras, proyectos y borradores locales; continuidad cloud no implementada |
| HBG Authority | Código server-side presente; **no desplegado en el Render auditado** |
| API server | Código y tests presentes; **no hay servicio API desplegado en el workspace auditado** |
| PostgreSQL de Render | **No se encontró ninguna instancia** |
| Terminador IA | Código y UI presentes, privado y protegido por diseño; backend OWNER no operativo en la PWA estática |
| Code Tools | Lectura/escritura protegidas en el código server-side; ejecución de comandos bloqueada |
| Mediador IA independiente | No localizado como componente ejecutable independiente |
| HBG Insights | Capacidad futura; no se encontró implementación de producto |
| QR Restaurant | Solo aparece como tarjeta “PRÓXIMAMENTE”; no es una aplicación funcional |
| Apps VIBRA e INSTINTO independientes e instalables | Pendiente; hoy son módulos dentro de la PWA Universo |
| Pruebas físicas Android/iOS | Pendientes |
| CI sobre el commit exacto de producción ad70d37 | No se encontró ejecución ni status asociado al SHA durante esta auditoría |

**Conclusión:** la publicación de la PWA está confirmada; la estabilidad total de Universo HBG, su backend de autoridad y las instalaciones independientes no están certificadas. No presentar el ecosistema completo como terminado.

## 2. Identidad y arquitectura oficial que no deben cambiarse

Universo HBG es un ecosistema de aplicaciones independientes conectadas progresivamente mediante servicios comunes.

**Arquitectura rectora:**

Aplicaciones independientes + HBG Core + HBG Authority + IA HBG + integración progresiva.

### Reglas permanentes

1. Cada aplicación pública debe poder instalarse, abrirse y funcionar independientemente, sin exigir instalar Universo HBG u otra aplicación.
2. Las aplicaciones deben contemplar ONLINE y OFFLINE como modos técnicos distintos de FREE y PRO.
3. FREE debe ser funcional; PRO añade capacidades profesionales. No convertir FREE en una demo.
4. Universo HBG conecta el ecosistema, pero no debe ser requisito para usar cada aplicación independiente.
5. HBG Core enruta, coordina y ofrece servicios comunes; **no concede permisos**.
6. HBG Authority es la autoridad técnica de identidad, permisos, sesiones y auditoría.
7. El OWNER es la autoridad soberana.
8. El Mediador IA interpreta, clasifica y programa; no es autoridad ni puede autoelevar privilegios.
9. Terminador IA administra infraestructura privada del OWNER y solo ejecuta operaciones autorizadas.
10. La aplicación ejecuta; el usuario decide dentro de sus permisos; HBG Authority autoriza operaciones protegidas.
11. Separar estrictamente USO y DESARROLLO.
12. Terminador IA y HVG Corp no son aplicaciones instalables para usuarios. Terminador es infraestructura privada del OWNER.
13. No habilitar ejecución de comandos de desarrollo sin aislamiento real de procesos.
14. No crear infraestructura de pago, migrar datos reales ni reemplazar la identidad OWNER sin autorización expresa.
15. No confundir interfaz, código, integración, deployment y prueba física: son estados distintos.

### Orden obligatorio de trabajo

**INSPECCIONAR → IMPLEMENTAR → PROBAR → CORREGIR → CERRAR → AVANZAR**

No empezar de cero. No reconstruir componentes existentes sin evidencia de que estén dañados. No declarar un resultado por intuición.

## 3. Repositorio, ramas y punto exacto de continuidad

Repositorio: humbertogomez310-beep/Hbg-Universe.

### Ramas observadas

| Rama | SHA observado | Función / situación |
|---|---|---|
| deploy/pwa-render | ad70d37ae71da09620b5b0cb1d6decef536270bb | Rama que alimenta la PWA pública |
| replit-agent | 40e4f3d0b59eb51f448674486dbd525e2c35512f | Rama predeterminada de GitHub; más antigua que producción |
| main | 77ae22b2432fe5fa435b485454c6b06b8dff7a31 | Rama principal histórica; más antigua que producción |
| fix/hbg-universe-stable | 705f4a7ce6670885ef0622c3be7e05b33201d76c | Rama antigua; no usar como base |

La comparación GitHub confirma que deploy/pwa-render es descendiente de replit-agent y main: está 191 commits por delante de replit-agent y 189 por delante de main, sin commits de esas ramas pendientes de incorporar a deploy. Por tanto, **la rama predeterminada no representa el último código publicado**.

La rama fix/hbg-universe-stable está 466 commits detrás de producción y no debe utilizarse para continuar.

### Regla de continuidad Git

- Para cambios nuevos de producto, crear una rama de trabajo desde el HEAD vigente de deploy/pwa-render.
- Nunca trabajar desde main o replit-agent suponiendo que contienen la portada y los cambios públicos más recientes.
- No fusionar ramas antiguas solo por su nombre.
- No borrar ramas backup, rollback o feature hasta comprobar que sus commits están preservados y que ya no son necesarios.
- Cada cambio debe tener respaldo identificable, PR, pruebas y criterio de rollback.
- No modificar directamente producción salvo corrección urgente y autorización correspondiente.

### Hitos de producción recientes

- PR #19 promovió la integración Local-first/audio a deploy/pwa-render.
- PR #20 y #21 corrigieron la activación y recarga de la PWA.
- PR #22 incorporó diagnóstico de actualizaciones con version.json.
- PR #24 introdujo la versión HBG 0.1.
- PR #26 creó la portada inicial.
- PR #27 corrigió la presentación móvil del estado de versión.
- PR #28 añadió identidad visual por aplicación.
- PR #29 rediseñó realmente la portada; merge commit de producción: ad70d37ae71da09620b5b0cb1d6decef536270bb.

PR #29: https://github.com/humbertogomez310-beep/Hbg-Universe/pull/29

### Trabajo abierto que no debe confundirse con producción

PR #11, “HBG LINGUA: comandos naturales y catálogo junto al micrófono”, continúa abierto y apunta a una rama de integración de audio, no directamente a producción. Su descripción registra 79 pruebas aprobadas y typecheck/build de staging, pero deja pendiente la prueba física en teléfono. No asumir que ese PR está integrado en deploy/pwa-render.

## 4. Render: infraestructura real observada

### Producción

- Servicio: universo-hbg-pwa-public
- ID: srv-dc257uhksfps73agvnug
- Tipo: static_site
- Rama: deploy/pwa-render
- Auto deploy: activado al recibir commits
- URL: https://universo-hbg-pwa-public.onrender.com
- Build command: instalación frozen-lockfile y build Vite de artifacts/universo-hbg
- Publish path: artifacts/universo-hbg/dist/public
- Variable de build: VITE_HBG_API_ENABLED=false

El último deployment observado fue dep-dc3hute0tbcc73detto0, con estado **LIVE**, terminado el 25-11-2026 a las 17:48:56 UTC, desde el commit ad70d37.

El log confirma Vite 7.3.3, 76 módulos transformados, build completado en 1.31 segundos, generación de version.json y publicación de los archivos estáticos. El CSS compilado fue 49.90 kB (10.80 kB gzip) y el JS 424.76 kB (126.67 kB gzip).

**Importante:** el build command de producción no ejecuta la suite de pruebas ni typecheck. Un build LIVE no sustituye CI.

### Backend y base de datos

- El workspace de Render no devolvió instancias PostgreSQL.
- El servicio público auditado es un sitio estático, no un API server.
- La API remota está deshabilitada en el build público mediante VITE_HBG_API_ENABLED=false.
- Las pruebas históricas de PostgreSQL utilizan una base temporal de CI; no demuestran que exista una base real de producción.
- No se verificó una identidad OWNER real ni secretos de producción. No solicitar, mostrar ni sustituir sus valores.

Por tanto, el login OWNER, HBG Authority, API remota de HBG Core y operaciones protegidas de Terminador no están acreditados como servicios operativos de la PWA pública actual.

### Servicios Render adicionales observados

Se encontraron servicios estáticos de staging o releases anteriores: universo-hbg-pr14-test, universo-hbg-instinto-pr14-staging, universo-hbg-voice-staging, universo-hbg-audio-staging, universo-hbg-pwa-release y universo-hbg-pwa.

No eliminar ni reconfigurar estos servicios durante esta auditoría. Primero identificar su último deployment, uso y necesidad. El servicio universo-hbg-instinto-pr14-staging conserva un build command con corepack enable; en una ejecución anterior falló por intento de modificar /usr/bin/pnpm en un sistema de archivos de solo lectura. No repetir ese comando sin corregir la causa.

Las métricas consultadas devolvieron series vacías. Los logs recientes disponibles para esta auditoría fueron logs de build; no se obtuvo evidencia suficiente de telemetría de uso o monitoreo de runtime.

## 5. Estado por aplicación y componente

### 5.1 UNIVERSO HBG — shell y PWA

**Existe y está desplegado:**
- Aplicación web React/Vite/TypeScript.
- Portada principal cinematográfica V2.
- Accesos a VIBRA PRO e INSTINTO.
- QR Restaurant marcado como próximamente.
- Sección informativa de HBG Core, HBG Authority, IA HBG y HBG Insights.
- Barra superior con controles de instalación y actualización.
- Identidad pública HBG 0.1 y diagnóstico de build.

**Portada V2:**
- Tres aplicaciones en fila en escritorio.
- Dos tarjetas principales y QR a ancho completo en móvil.
- Fondo espacial, horizonte terrestre, identidad HBG, iconografía y efectos responsive.
- La navegación existente de VIBRA e INSTINTO se conserva.
- QR Restaurant no abre una aplicación.
- HBG Core conserva acceso al módulo existente.
- Terminador no se presenta como aplicación pública.

**Pendiente:**
- Confirmar visualmente la portada en el teléfono del OWNER.
- Verificar que la PWA instalada haya descargado el build ad70d37 y no esté mostrando recursos anteriores de caché.
- Revisar tamaños reales, textos, tarjetas, menú y barra de versión en Android e iOS.

### 5.2 PWA, instalación, actualización y offline

**Implementado en código:**
- Manifest PWA e iconos.
- Botón de instalación en la barra superior.
- Prompt nativo cuando el navegador lo ofrece.
- Instrucciones alternativas para iOS/Safari y navegadores sin prompt.
- Service Worker hbg-pwa-v7.
- Caché del shell, manifest, iconos y assets estáticos.
- Navegación network-first con fallback al shell cacheado.
- Exclusión de API, autenticación y version.json de la caché.
- version.json con releaseVersion y buildId.
- Botón de actualización que compara la compilación instalada con la publicada.

**Límite real:** esto acredita una PWA de Universo HBG, no una certificación de funcionamiento offline completo. El Service Worker conserva el shell y recursos estáticos; no convierte automáticamente los servicios remotos en locales.

**Pendiente de prueba física:**
1. Instalar desde navegador en Android/Chrome.
2. Abrir desde el icono en modo standalone.
3. Cerrar y volver a abrir.
4. Recargar con Internet.
5. Abrir sin conexión después de una carga correcta.
6. Volver online y comprobar actualización.
7. Verificar que version.json y el buildId coincidan con el servidor.
8. Repetir el flujo en iOS/Safari y escritorio Chromium.

### 5.3 HBG CORE

**Existe en frontend:**
- Router de acciones registradas.
- Registro de módulos.
- Contexto y memoria local.
- Event bus y eventos de solicitud, éxito y fallo.
- Persistencia local cuando el navegador la permite.
- Integración de módulos con acciones reales registradas.
- Manejo de errores y solicitudes pendientes.

**Límite:** HBG Core no es autoridad. Los eventos entre módulos no autorizan acciones.

**No disponible en la PWA pública actual:**
- API remota, porque el build público desactiva la API.
- IA generativa remota operativa.
- Sincronización cloud o multi-dispositivo verificada.

### 5.4 HBG VOICE / HBG LINGUA

**Existe en frontend:**
- Barra de voz.
- Captura mediante las APIs de reconocimiento del navegador.
- Normalización de español, acentos y expresiones.
- Clasificación de órdenes conocidas.
- Catálogo de comandos en una rama/PR pendiente.
- Respuesta hablada mediante capacidades del navegador.
- Integración con acciones registradas de HBG Core y VIBRA.
- Timeout de captura y limpieza de sesión.

**Límites:**
- La captura es iniciada por interacción del usuario.
- El reconocimiento es de una intervención; el código usa continuous=false e interimResults=false.
- No hay evidencia de wake word permanente ni escucha en segundo plano.
- No se debe prometer funcionamiento idéntico en todos los navegadores.
- No existe benchmark reproducible de 100 órdenes ni porcentaje ≥90% validado en dispositivos.

**Pendiente:** probar español real, ruido, permisos, cancelación, errores, respuesta hablada y comandos en teléfono.

### 5.5 VIBRA PRO

**Existe en código:**
- Reproductor de biblioteca local.
- Persistencia de datos y preferencias.
- Playlists, favoritos, historial, shuffle y repetición.
- Ecualizador y visualizador cuando el navegador soporta la cadena de audio.
- Modos/presets de ánimo.
- Dirección musical explícita.
- Auto DJ básico y modo Fiesta PRO.
- Integración de órdenes de voz.
- Media Session API para controles compatibles de pantalla bloqueada.
- Coordinador de audio HBG para salidas registradas.

**Audio y voz:**
- El coordinador aplica un factor temporal de ducking de 0.55 durante una sesión de voz.
- La intención es mantener la música sonando y atenuarla, no pausarla.
- Al finalizar la sesión se restaura el factor normal.
- Solo controla salidas de audio registradas dentro de Universo HBG; no cambia el volumen maestro del teléfono ni controla audio de otras aplicaciones.

**Límite del Auto DJ actual:**
- musicDirector.ts normaliza el texto de dirección musical y busca términos en título, artista y álbum.
- Excluye la pista actual y prioriza canciones no reproducidas recientemente.
- Selecciona el primer candidato que coincide; no es un motor profesional de mezcla.
- El campo de energía se conserva, pero el selector de canciones no lo utiliza para puntuar candidatos.
- No se verificó beatmatching, mezcla armónica, transiciones profesionales ni adaptación autónoma basada en señales reales del ambiente.
- Los modos de ánimo disponibles no acreditan detección automática y fiable del estado emocional del usuario.

**Pendiente:**
- Pruebas físicas de música durante captura y respuesta hablada.
- Restauración correcta al terminar voz.
- Cambio manual de volumen durante ducking.
- Interrupciones reales del sistema operativo.
- Reproducción, cola, playlists, repeat-one, repeat-all, shuffle y Media Session.
- Prueba de selección de Auto DJ con biblioteca real.
- Completar Manos Libres según el requisito oficial sin afirmar wake word que la PWA no soporta.

### 5.6 INSTINTO

**Existe en código:**
- Notas, letras, proyectos y borradores.
- Almacenamiento IndexedDB.
- Migración desde claves antiguas de localStorage.
- Autosave y manejo de errores de almacenamiento.
- Generadores locales de ideas, hooks y contenido de inspiración.
- Respaldo, exportación e importación validada.

**Límites:**
- No se verificó sincronización cloud o entre dispositivos.
- Los generadores locales no equivalen a IA generativa remota.
- Los resultados deben seguir siendo borradores hasta que el usuario decida guardarlos.

**Pendiente:** crear, editar, guardar, buscar, exportar, importar y restaurar datos reales en Android/iOS, incluso después de cerrar la PWA y reiniciar el dispositivo.

### 5.7 QR RESTAURANT

**Estado:** no implementado como aplicación funcional en la rama pública auditada. Solo aparece en la portada con estado “PRÓXIMAMENTE”.

Se conserva el alcance oficial futuro:
- Modo FREE funcional.
- Modo PRO con funciones profesionales.
- Menú QR, inventario, ventas y Finanzas del Restaurante.
- Registro de ingresos y gastos, cortes y resultado neto.
- Exportaciones, gráficas, historial e insights en PRO.
- IA HBG como asistencia, nunca como autoridad.

No iniciar QR Restaurant antes de cerrar y estabilizar la base de Universo HBG.

### 5.8 HBG AUTHORITY

**Código server-side localizado:**
- Roles owner, user y system.
- Sesiones autenticadas y sesiones de desarrollo.
- Permisos explícitos.
- Separación entre uso y desarrollo.
- Grants de modificación vinculados a OWNER, sesión de desarrollo, ruta exacta, motivo, expiración y revocación.
- El permiso universe.code.modify no se concede automáticamente por ser OWNER.
- Las concesiones tienen duración máxima de 15 minutos.
- Auditoría con sanitización de metadatos.
- Guards que rechazan acceso sin sesión, permiso o auditoría.
- Code Tools protege rutas y archivos críticos de Authority.

**Code Tools:**
- Lista e inspecciona archivos.
- Escritura y borrado requieren sesión OWNER de desarrollo y grant vigente para la ruta exacta.
- Protege rutas sensibles, secretos, symlinks y path traversal.
- Usa descriptores de directorio en Linux y escritura atómica.
- Si la auditoría falla, bloquea la operación o advierte que el recurso debe verificarse antes de reintentar.
- La ejecución de scripts/comandos está bloqueada: runSafeWorkspaceScript falla explícitamente hasta disponer de aislamiento real de procesos.

**Estado operativo:** el código está en el repositorio y tiene tests, pero no hay API server ni PostgreSQL desplegados en el Render auditado. Por eso no está acreditado como autoridad central operativa en la PWA pública.

### 5.9 TERMINADOR IA

- Es infraestructura privada del OWNER, no aplicación pública ni instalable.
- La UI y los módulos de Terminador existen en el frontend.
- Shell y Sidebar condicionan su montaje/visibilidad a una sesión OWNER confirmada por el servidor.
- La PWA pública tiene API remota deshabilitada, por lo que no puede confirmar una sesión OWNER y no debe exponer Terminador como módulo público.
- El backend tiene guards, autorización de operaciones, registro de aplicaciones y auditoría.
- La ejecución de Code Tools en TypeScript sigue bloqueada hasta contar con aislamiento.

**Riesgo heredado que debe mantenerse aislado:** terminador_ia.py contiene una función run_command que usa subprocess.run y una lista básica de comandos bloqueados. No equivale a un sandbox ni a una política de ejecución segura. No conectar ni habilitar esa ruta hasta que HBG Authority, aislamiento de procesos, permisos y auditoría estén cerrados y probados.

### 5.10 MEDIADOR IA, HBG INSIGHTS y HVG CORP

- **Mediador IA:** su función arquitectónica está definida, pero no se localizó un componente independiente ejecutable en el árbol auditado. No declararlo implementado.
- **HBG Insights:** capacidad transversal futura para alertas, oportunidades, advertencias y recomendaciones; no se localizó un módulo funcional.
- **HVG Corp:** no es aplicación instalable según la decisión de continuidad recuperada. No se debe convertir en aplicación pública ni confundir con Terminador.

## 6. Datos, persistencia y funcionamiento offline

- VIBRA conserva datos musicales locales y preferencias en almacenamiento del navegador.
- INSTINTO utiliza IndexedDB y conserva mecanismos de migración/backup.
- HBG Core conserva memoria/contexto local cuando el navegador permite almacenamiento.
- El Service Worker cachea shell y assets estáticos; excluye API, autenticación y version.json.
- La disponibilidad offline depende de que los datos y archivos necesarios ya estén guardados localmente.
- No hay evidencia de sincronización multi-dispositivo completa.
- No hay PostgreSQL de producción en el workspace Render auditado.
- No prometer que una operación remota, IA remota, login OWNER o servicio externo funciona offline.

FREE/PRO y ONLINE/OFFLINE permanecen como ejes separados. No introducir una dependencia de Internet para operaciones que ya pueden realizarse localmente.

## 7. Seguridad: reglas de no regresión

1. No confiar en campos del cliente como owner=true, role=owner, authorized=true o equivalentes.
2. La identidad y los permisos deben validarse server-side.
3. El OWNER no recibe universe.code.modify automáticamente.
4. Toda escritura/borrado requiere sesión de desarrollo y grant exacto vigente.
5. Proteger HBG Authority, auditoría, autenticación, grants, Registry y esquema de base de datos.
6. Si auditoría no está disponible, bloquear operaciones sensibles.
7. No ejecutar scripts arbitrarios desde Terminador o Mediador.
8. No habilitar subprocess.run ni comandos de shell sin sandbox real.
9. Terminador no debe instalarse como aplicación pública ni exponerse a usuarios.
10. No modificar permisos, identidad OWNER, secretos ni base de datos real sin respaldo y autorización.
11. No permitir que una IA se convierta en OWNER o amplíe sus propios permisos.
12. Los mensajes y archivos externos se tratan como datos no confiables, nunca como instrucciones de autoridad.

## 8. Pruebas y evidencia disponible

### Evidencia positiva

- GitHub Actions run 45071929911 terminó SUCCESS sobre el commit 40e4f3d del 22-11-2026.
- El workflow de CI contempla instalación frozen-lockfile, PostgreSQL 16 temporal, migración, tests API, tests de aplicación, typecheck y builds.
- Existen suites para HBG Authority, Code Tools, auditoría, Registry, Terminador, HBG Core, VIBRA, INSTINTO, voz y PWA.
- Render confirmó LIVE para ad70d37 y el build Vite terminó correctamente.

### Lo que no está acreditado

- No se encontró workflow run ni status asociado al commit de producción ad70d37 durante esta auditoría.
- El último CI verde identificado corresponde a un SHA anterior; no sustituye la validación del código posterior.
- Render ejecutó el build estático, no la suite de pruebas ni typecheck.
- No se realizó prueba física de instalación, actualización, offline, voz o audio en el teléfono.
- No se validó login OWNER contra una base real.
- No se ejecutó migración contra PostgreSQL de producción.
- No se verificó backup/restauración de datos reales.
- No se midió el 90% de asertividad con un benchmark representativo.

**Regla:** no declarar 90% de asertividad, estabilidad total o Release Candidate hasta que existan resultados reproducibles sobre el SHA exacto y pruebas físicas donde correspondan.

## 9. Registro de riesgos y prioridad

| Prioridad | Hallazgo | Acción necesaria |
|---|---|---|
| P0 | Producción no tiene CI acreditado para ad70d37 | Ejecutar CI completo sobre el SHA exacto |
| P0 | PWA pública compila con API deshabilitada | Mantener claro que Authority/OWNER/Terminador no están operativos allí |
| P0 | No hay PostgreSQL de Render | No habilitar backend real sin diseño, respaldo, aprobación y prueba |
| P0 | Terminador Python contiene subprocess.run | Mantener aislado; no habilitar ejecución |
| P1 | Portada V2 aún sin validación física | Confirmar en teléfono instalado |
| P1 | Instalación y actualización PWA no probadas en dispositivos | Pruebas Android/iOS/escritorio |
| P1 | Manos Libres no es wake word/escucha en segundo plano | Definir y probar el alcance compatible con plataforma |
| P1 | Auto DJ actual usa selección simple por metadatos | Evolucionar después de pruebas con biblioteca real |
| P1 | VIBRA e INSTINTO no son paquetes instalables independientes | Diseñar distribución independiente sin duplicar datos/motores |
| P1 | No hay prueba completa de backup/restore | Probar exportación e importación real |
| P2 | Existen servicios Render de staging/release antiguos | Inventariar uso antes de archivar o eliminar |
| P2 | PR #11 permanece abierto en rama de integración | Decidir su integración después de prueba física |
| P2 | HBG Insights, Mediador independiente y QR Restaurant pendientes | No adelantar estas capacidades |

## 10. Plan obligatorio de estabilización

No ejecutar cambios de producto a ciegas. Seguir este orden:

### Fase A — Certificar el código de producción
1. Partir del SHA ad70d37.
2. Ejecutar el workflow completo: migración temporal, tests API, tests de aplicación, typecheck, build de workspace y build PWA.
3. Si falla, localizar la causa y corregir en rama separada.
4. No promover un cambio hasta que el CI del SHA candidato esté verde.
5. Guardar logs, SHA y resultados.

### Fase B — Certificar la PWA instalada
1. Confirmar buildId y versión 0.1 en el teléfono.
2. Confirmar portada V2 y navegación.
3. Probar instalación, standalone, cierre/reapertura, actualización y offline.
4. Repetir en dispositivos objetivo.
5. Registrar los resultados; no asumir que Render LIVE equivale a PWA actualizada.

### Fase C — Certificar VIBRA
1. Biblioteca local y persistencia.
2. Reproducción, cola, playlists, shuffle y repetición.
3. Ducking durante captura y respuesta de voz sin pausar la música.
4. Restauración del volumen y manejo de pausa explícita.
5. Interrupciones reales del teléfono.
6. Media Session y controles compatibles.
7. Auto DJ con biblioteca real; distinguir selección de canciones de mezcla profesional.

### Fase D — Certificar INSTINTO
1. Crear/editar/guardar notas, letras y proyectos.
2. Cerrar y reabrir la aplicación.
3. Confirmar autosave y migración de datos.
4. Exportar, borrar una copia de prueba e importar.
5. Probar IndexedDB no disponible y fallback.
6. Probar offline.

### Fase E — HBG Authority y Terminador
1. Definir el entorno server-backed y su costo antes de provisionarlo.
2. Confirmar backup y esquema antes de migrar cualquier DB real.
3. Verificar identidad OWNER original; nunca reemplazarla por conveniencia.
4. Ejecutar pruebas positivas y negativas de roles, sesiones, grants, expiración, revocación y auditoría.
5. Verificar guards independientes por herramienta.
6. Verificar que Code Tools no puede modificar Authority ni ejecutar comandos.
7. Mantener Terminador privado y fuera de la beta pública.
8. No conectar terminador_ia.py hasta que exista sandbox y autorización completa.

### Fase F — Aplicaciones independientes
1. Definir empaquetado/instalación independiente de VIBRA.
2. Definir empaquetado/instalación independiente de INSTINTO.
3. Mantener sus motores y datos sin duplicación accidental.
4. Probar que cada una funciona sin instalar Universo HBG.
5. Mantener ONLINE/OFFLINE separado de FREE/PRO.

### Fase G — Cierre de beta
- Sin defectos P0/P1 abiertos.
- CI verde en el SHA candidato.
- Pruebas físicas completadas.
- Datos locales respaldados y restaurables.
- Terminador inaccesible al público.
- Mensajes de disponibilidad honestos.
- Aprobación del OWNER antes de ampliar infraestructura o capacidades.

## 11. Próximo punto de trabajo recomendado

**No iniciar QR Restaurant ni una expansión de IA todavía.**

El siguiente trabajo debe comenzar por la Fase A: ejecutar el CI completo sobre el commit exacto ad70d37 de producción. Después, continuar con la prueba física de la PWA instalada y los flujos reales de VIBRA e INSTINTO.

La siguiente rama de código debe salir del HEAD vigente de deploy/pwa-render, no de main ni de una rama antigua. Antes de cualquier modificación, comprobar que el HEAD no haya cambiado.

## 12. Criterios de aceptación para declarar “estabilizado”

Universo HBG solo puede declararse estabilizado cuando se cumpla todo:

- [ ] CI completo verde en el SHA exacto candidato.
- [ ] Build de producción y build PWA correctos.
- [ ] Portada y navegación verificadas en teléfono.
- [ ] Instalación, standalone, actualización y offline probados.
- [ ] VIBRA probado con biblioteca real y sesiones de voz.
- [ ] Ducking y restauración verificados físicamente.
- [ ] INSTINTO probado con persistencia y backup/restore.
- [ ] Terminador no visible ni utilizable por usuarios públicos.
- [ ] HBG Authority probada en backend real antes de activar operaciones privilegiadas.
- [ ] PostgreSQL respaldado y migraciones verificadas si se incorpora una base real.
- [ ] Code Tools con grants exactos, auditoría y ejecución bloqueada hasta sandbox.
- [ ] No hay defectos P0/P1 abiertos.
- [ ] El OWNER aprueba la promoción.

## 13. Reglas para el siguiente chat o agente

Quien continúe debe:

1. Leer este documento completo antes de modificar código.
2. Conservar la arquitectura y decisiones oficiales.
3. Verificar el HEAD actual de deploy/pwa-render.
4. No empezar de cero ni reconstruir módulos existentes.
5. No confundir la rama predeterminada con producción.
6. No confundir build LIVE con CI verde ni con prueba física.
7. No exponer Terminador, secretos, OWNER o permisos.
8. No habilitar subprocess, shell ni Code Tools run.
9. No provisionar servicios de pago ni migrar datos reales sin aprobación.
10. Trabajar con evidencia, pruebas y rollback.
11. Informar qué está comprobado, qué falta y qué está bloqueado.
12. Avanzar con la secuencia INSPECCIONAR → IMPLEMENTAR → PROBAR → CORREGIR → CERRAR → AVANZAR.

## 14. Registro de esta actualización

- Se recuperó y preservó la hoja maestra anterior del 05-11-2026.
- Se revisaron los checkpoints del 22-11-2026 y el plan maestro del 24-11-2026.
- Se inspeccionó GitHub, ramas, PR relevantes, código de frontend/backend y workflows.
- Se inspeccionó Render, servicio público, deployments, build logs, servicios y disponibilidad de PostgreSQL.
- Se confirmó que la portada V2 está desplegada en el commit ad70d37.
- No se modificó lógica de aplicaciones, audio, voz, permisos, autenticación, backend ni Terminador durante esta auditoría.
- Este archivo es una consolidación documental; no afirma que las pruebas físicas o de backend pendientes hayan sido completadas.

---

**FIN — UNIVERSO HBG / HOJA MAESTRA Y CHECKPOINT OFICIAL / 25-11-2026**
