# PLAN MAESTRO DE EVOLUCIÓN — UNIVERSO HBG
**Versión:** 1.0  
**Fecha:** 24 de noviembre de 2026  
**Objetivo:** convertir la base actual de Universo HBG en una aplicación pública de prueba, instalable, útil y medible; después evolucionarla por etapas sin duplicar arquitectura ni comprometer producción.

---

## 1. Decisión estratégica

No se reconstruye Universo HBG desde cero y no se espera a terminar todas las funciones futuras para probar el producto.

Se adopta una estrategia **Local-first + Public Beta + evolución por capacidades**:

1. Publicar para pruebas una versión coherente con las funciones locales que ya existen.
2. Hacer que la PWA sea fácil de instalar y abrir desde el icono del dispositivo.
3. Comunicar con claridad qué funciona localmente, qué necesita Internet y qué está todavía en desarrollo.
4. Observar uso, instalaciones, errores y comentarios sin recopilar contenido privado.
5. Evolucionar cada módulo con pruebas y criterios de aceptación verificables.

La versión inicial se considera **beta pública de validación**, no una declaración de producto terminado ni de disponibilidad comercial definitiva.

## 2. Alcance de la beta pública

### Incluido
- HBG Core local: navegación, interpretación de comandos soportados, acciones registradas, memoria local y coordinación parcial de módulos.
- HBG Voice: captura por interacción del usuario, interpretación local disponible y respuesta hablada del navegador.
- VIBRA: reproducción de biblioteca local, controles existentes, playlists locales y ecualizador existente.
- INSTINTO: notas, ideas, borradores y generadores locales actualmente disponibles.
- PWA: instalación, apertura independiente y caché del shell y recursos estáticos.
- Terminador: permanece privado y exclusivo del OWNER; no forma parte de la experiencia pública.

### No prometer en la beta
- IA generativa remota de HBG Core: no hay modelo remoto operativo configurado.
- Sincronización en la nube o entre dispositivos.
- Activación permanente del micrófono o escucha en segundo plano.
- Auto DJ inteligente completo: la selección actual es limitada y no equivale a mezcla profesional.
- Automatizaciones reales de Terminador, backend remoto o base de datos operativa.
- Disponibilidad offline de servicios que dependen de Internet o de contenido musical no descargado localmente.

### Mensaje de producto
Universo HBG es una aplicación modular para explorar música, creatividad y herramientas de asistencia local. Algunas funciones están en beta y se irán habilitando conforme superen pruebas.

## 3. Línea base técnica verificada

| Área | Línea base |
|---|---|
| Producción Render | `universo-hbg-pwa-public`, rama `deploy/pwa-render`, URL `https://universo-hbg-pwa-public.onrender.com` |
| Staging Render | `universo-hbg-pr14-test`, rama `local-first/instinto-reuse-integration`, URL `https://universo-hbg-pr14-test.onrender.com` |
| Commit base auditado | `380639c1c1fb409f52d091ac6cb49ed2bd10e79c` |
| Commit actual con preparación PWA | `d0bd8326fac1f614e84174271ff5aa00d27c2f6b` (staging LIVE) |
| PR #14 | Abierta; no fusionar sin pruebas y aprobación del OWNER |
| API remota | Deshabilitada en los sitios estáticos consultados |
| Backend / PostgreSQL Render | No desplegados en el workspace auditado |
| PWA | Manifest y Service Worker presentes; caché del shell implementada |
| Instalación | Había un flujo de instalación dentro de una sección secundaria de HBG Core; se requiere acceso global y validar los navegadores reales |

La rama `deploy/pwa-render` y los servicios de producción quedan protegidos. Los cambios de preparación de beta se validan en staging.

## 4. Fases de evolución y entregables

### Fase 0 — Protección y trazabilidad
**Objetivo:** poder avanzar y revertir sin poner en riesgo lo que ya funciona.

- Mantener producción sin cambios no autorizados.
- Guardar commit y respaldo antes de cambios.
- Identificar la rama y el servicio de staging que se está probando.
- Registrar para cada capacidad: código presente, conexión runtime, prueba automatizada, prueba física y estado desplegado.
- No reabrir subsistemas aceptados sin una causa reproducible.

**Salida:** inventario versionado y trazabilidad de cada cambio.

### Fase 1 — Beta pública e instalación PWA
**Objetivo:** que cualquier usuario pueda entrar, entender el alcance, instalar y volver a abrir la aplicación desde su dispositivo.

- Botón global «Instalar» en la barra superior.
- Prompt nativo cuando el navegador lo ofrezca.
- Instrucciones alternativas para iOS/Safari y navegadores sin prompt.
- Manifest con identidad estable, iconos raster 192×192 y 512×512, icono vectorial alternativo y modo `standalone`.
- Service Worker con versión de caché nueva y precarga de iconos y shell.
- Verificar HTTPS, MIME del manifest, rutas, iconos, caché y actualización del Service Worker.
- Corregir referencias antiguas de metadatos que apunten a hosting retirado.
- Probar instalación, apertura desde icono, reinicio, navegación offline y actualización en Android, iOS y escritorio.

**Criterio de salida:** instalación y apertura independiente comprobadas en al menos un Android/Chrome, un iPhone/Safari y un escritorio Chromium; shell abre sin conexión después de una instalación/carga correcta. Las diferencias de instalación entre plataformas se documentan.

### Fase 2 — HBG Core: contrato universal de capacidades
**Objetivo:** que HBG Core sepa qué puede hacer cada aplicación y enrute acciones reales sin inventarlas.

- Registro universal de capacidades por aplicación.
- Cada capacidad declara identificador, descripción, parámetros, permisos, disponibilidad y resultado.
- Un solo flujo de interpretación para chat y micrófono.
- Un solo ejecutor autorizado; las aplicaciones conservan la responsabilidad de ejecutar sus funciones.
- Respuesta de éxito solo después de confirmación real.
- Preguntas de aclaración cuando falten parámetros o haya ambigüedad.
- Rechazo explícito de acciones no registradas o no autorizadas.
- Eventos internos protegidos frente a falsificación por módulos.

**Criterio de salida:** pruebas de contrato para cada acción pública y ninguna confirmación de éxito sin resultado de ejecución.

### Fase 3 — HBG Voice PRO
**Objetivo:** convertir el micrófono de órdenes puntuales en una experiencia de voz fiable y configurable.

- Medir reconocimiento de español en distintos acentos, ruido y dispositivos.
- Mejorar normalización de expresiones naturales y desambiguación.
- Configurar voz de respuesta, idioma, velocidad, tono y volumen donde el sistema lo permita.
- Estados visibles: listo, escuchando, procesando, respondiendo, error y permiso denegado.
- Cancelación e interrupción de respuesta hablada.
- Continuidad de conversación por voz dentro de límites del navegador.
- Manos Libres en primer plano; investigar aplicación nativa solo si se requiere escucha en segundo plano.
- No implementar wake word ni escucha permanente como si una PWA pudiera garantizarlo.

**Criterio de salida:** benchmark reproducible de órdenes, pruebas físicas y 0 ejecuciones no autorizadas.

### Fase 4 — VIBRA PRO
**Objetivo:** madurar el reproductor existente y convertir Auto DJ en un conductor musical útil.

- Preservar reproductor, biblioteca, IndexedDB y ecualizador existentes.
- Validar cadena de audio, bandas, volumen, persistencia y presets.
- Enriquecer metadatos: artista, álbum, género, año, BPM cuando sea obtenible y energía estimada.
- Separar selección de siguiente canción, cola, transición y mezcla; no llamar «mezcla» a una simple reproducción consecutiva.
- Auto DJ normal: respetar intención explícita del usuario.
- Modo Fiesta: adaptar progresivamente energía y estilo mediante señales disponibles.
- Mood Engine como apoyo, nunca como sustituto de una instrucción explícita.
- Medir calidad de selección, repeticiones, transiciones y estabilidad.

**Criterio de salida:** sesiones de prueba con biblioteca real; selección coherente medida por evaluación humana y pruebas de regresión. No declarar DJ profesional sin beatmatching/transiciones reales.

### Fase 5 — INSTINTO PRO
**Objetivo:** pasar de notas y plantillas a continuidad creativa y productividad.

- Mantener IndexedDB y los datos existentes.
- Preservar el borrador como borrador; no guardar contenido sin acción explícita.
- Mejorar generadores locales y etiquetar claramente su alcance.
- Relacionar notas, proyectos, ideas, hooks y referencias.
- Recuperar contexto de un proyecto y permitir continuarlo.
- Integrar las capacidades mediante el registro universal de HBG Core.
- Incorporar IA generativa remota solo cuando exista proveedor, privacidad, costo y autorización definidos.

**Criterio de salida:** flujos completos de crear, editar, guardar, buscar, exportar y restaurar sin pérdida de datos.

### Fase 6 — HBG Authority y TERMINADOR
**Objetivo:** habilitar la infraestructura privada del OWNER de forma segura.

- Mantener la separación USO / DESARROLLO.
- Validar identidad, roles, permisos, sesiones, guards y auditoría.
- Preparar backend y base de datos con arquitectura y costo revisados.
- No crear ni activar servicios de pago ni base de datos sin aprobación explícita.
- Validar recuperación del acceso OWNER antes de abrir herramientas de desarrollo.
- Proteger las herramientas de código y la propia HBG Authority.
- Mantener TERMINADOR fuera de la beta pública.

**Criterio de salida:** pruebas de autorización negativas y positivas; cada operación de escritura exige sesión y permiso explícitos; auditoría verificable.

### Fase 7 — Medición, calidad y crecimiento
**Objetivo:** saber si el producto gusta y si genera uso recurrente antes de invertir en nuevas capacidades.

- Medir tráfico de sitio y consumo de recursos desde el proveedor de hosting cuando esté disponible.
- Medir embudo de instalación, activación, uso por módulo, retención y errores solo con instrumentación aprobada.
- No registrar audio, transcripciones, prompts, notas, letras ni datos personales en telemetría.
- Preferir métricas agregadas y minimizadas; informar al usuario y obtener consentimiento cuando corresponda.
- Añadir un canal claro de comentarios y reporte de errores.
- Probar con un grupo pequeño antes de ampliar difusión.
- Priorizar mejoras por impacto observado, frecuencia, severidad y costo.

**Criterio de salida:** tablero de métricas confiable, política de datos clara y decisiones respaldadas por uso real.

## 5. Regla del 90% de asertividad

El 90% no se declarará por intuición ni por una conversación exitosa. Se medirá por dominio.

Para HBG Voice y HBG Core:

- Construir un conjunto de al menos 100 órdenes representativas, con variaciones naturales y órdenes no soportadas.
- Separar clasificación de intención, extracción de parámetros, autorización y resultado de ejecución.
- Objetivo: ≥90% de clasificación correcta en el conjunto de prueba.
- Objetivo: ≥90% de ejecución correcta para acciones soportadas y autorizadas.
- Objetivo: ≥95% de aclaración/rechazo correcto ante órdenes ambiguas o no soportadas.
- Objetivo: 100% de cumplimiento de permisos y 0 falsos mensajes de éxito.
- Repetir pruebas en dispositivos y condiciones distintas.
- Publicar el porcentaje por categoría; no ocultar fallos con un promedio global.

El nivel de confianza de una función solo sube cuando pasan pruebas automatizadas y físicas. Si falta una de ellas, se marca como pendiente.

## 6. Criterios mínimos de beta pública

La beta puede invitar usuarios cuando se cumpla todo lo siguiente:

1. La URL pública carga por HTTPS y no presenta errores críticos.
2. HBG Core, VIBRA e INSTINTO abren y permiten completar sus flujos locales básicos.
3. La instalación PWA funciona en plataformas objetivo o muestra instrucciones correctas.
4. El usuario sabe qué datos se guardan localmente y qué funciones requieren Internet.
5. Terminador no está disponible para usuarios públicos.
6. No hay secretos, credenciales ni datos privados expuestos.
7. Los respaldos y la recuperación de datos locales están probados.
8. No quedan defectos críticos P0/P1 abiertos.
9. Existe un canal de comentarios y un procedimiento para corregir y publicar.
10. El OWNER aprueba el paso de staging a producción.

## 7. Orden de trabajo inmediato

1. **Hecho en staging:** botón global de instalación, fallback de instrucciones, iconos PNG 192/512, manifest y caché Service Worker v4.
2. **Hecho en staging:** 103 pruebas aprobadas, typecheck y build de producción completados.
3. **Pendiente:** pruebas físicas de instalación y apertura standalone en Android/Chrome, iOS/Safari y escritorio.
4. Probar como usuario público: entrar, navegar, usar VIBRA, usar INSTINTO, recargar, cerrar y abrir desde el icono.
5. Registrar errores y comentarios; corregir únicamente lo que falle.
6. Presentar resultados al OWNER.
7. Solo con aprobación explícita, preparar la publicación de beta en la URL pública.

## 8. Reglas de control del proyecto

- Secuencia obligatoria: **INSPECCIONAR → IMPLEMENTAR → PROBAR → CORREGIR → CERRAR → AVANZAR**.
- No modificar producción sin autorización explícita.
- No fusionar PR #14 hasta que el OWNER confirme las pruebas.
- No tocar el subsistema de audio aceptado sin un fallo nuevo y reproducible.
- No gastar antes de recibir; todo servicio de pago requiere aprobación.
- No usar Replit para hosting, backend ni despliegue.
- No exponer secretos en frontend, repositorio, logs ni documentación.
- No declarar una función terminada por tener interfaz o código: debe estar conectada y probada.
- Mantener checkpoints y respaldos para rollback.

---

**Resultado esperado:** una primera versión pública de Universo HBG que sea instalable, comprensible y suficientemente estable para medir aceptación; y una ruta de evolución que convierta gradualmente el conjunto actual de módulos en un ecosistema integrado, seguro y medible.
