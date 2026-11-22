# Universo HBG — checkpoint de continuidad
Fecha: 2026-11-22
Rama de trabajo: `replit-agent`
HEAD validado de este checkpoint: `17e38f3e7a929ca0cfa297f763e30f82198271d5`
Base de esta tanda: `6ec70948e69e5b2e82f92564e0fd317484dc9b24`
Avance desde esa base: 106 commits confirmados en GitHub.

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

## Estado de verificación al guardar este checkpoint
- HEAD validado: `17e38f3e7a929ca0cfa297f763e30f82198271d5`.
- GitHub Actions run `45068744282` terminó `success` sobre exactamente ese HEAD.
- Node.js 24: instalación congelada, PostgreSQL 16 aislado y provisionamiento de schema correctos.
- Tests API: aprobados.
- Tests de aplicación Universo HBG: aprobados, incluidos tests de integración del ejecutor global de voz.
- Typecheck del workspace: aprobado.
- Build de producción del workspace: aprobado.
- Validación sintáctica de service worker, manifest y script post-merge: aprobada.
- El primer intento de esta revisión detectó una aserción desactualizada en el test de listado de Code Tools; se corrigió para aceptar la carpeta interna válida `safe`, manteniendo las pruebas que rechazan symlinks y rutas protegidas. La suite posterior pasó.
- Esta CI usa una base PostgreSQL temporal; no demuestra que la base de datos de producción esté provisionada ni migrada.
- No se ha ejecutado una prueba integral de producción en el deployment de Replit.
- No declarar la publicación verificada basándose únicamente en el build de GitHub.

## Siguientes pasos obligatorios
1. Esperar y revisar el resultado de CI del HEAD actual; abrir logs de jobs si falla y corregir causas reales.
2. Revisar específicamente los contratos de grants y guards en cada operación Code Tools, incluidos límites de ruta, TOCTOU/symlinks y auditoría.
3. Confirmar que los scripts de pruebas cubren Authority, Code Tools, Terminador, Core/memoria, INSTINTO, VIBRA y voz; ampliar pruebas negativas de autorización.
4. Revisar coherencia entre migraciones/schema Drizzle y las tablas exigidas por health check; no ejecutar cambios destructivos sobre una DB real.
5. Completar las brechas funcionales restantes de UI/API y persistencia, sin inventar capacidades ni reemplazar módulos existentes.
6. Ejecutar CI después de cada corrección sustantiva y lograr un CI verde sobre el HEAD de entrega.
7. Crear punto de recuperación final; solo entonces incorporar en Replit, verificar variables, DB/schema, URL/API, autenticación y flujos reales, y conservar posibilidad de rollback.

Este archivo es un checkpoint de continuidad, no una declaración de finalización ni de publicación.
