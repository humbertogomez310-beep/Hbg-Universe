# Universo HBG — checkpoint de continuidad
Fecha: 2026-11-22
Rama de trabajo: `replit-agent`
HEAD al crear este checkpoint: `2302e7765261d1dd5bb47fd891a32a585490c972`
Base de esta tanda: `6ec70948e69e5b2e82f92564e0fd317484dc9b24`
Avance desde esa base: 82 commits confirmados en GitHub.

## Orden de trabajo que permanece vigente
- GitHub es la fuente única de desarrollo y finalización. No adaptar la aplicación a las limitaciones del workspace de Replit.
- Replit se utilizará después para incorporar la versión terminada, publicar y verificar el deployment.
- Preservar historia, módulos, datos y capacidades existentes.
- No declarar una capacidad probada sin evidencia de ejecución real.
- Mantener HBG Authority como autoridad soberana; el Mediador/TERMINADOR interpreta y solicita, pero no se concede permisos a sí mismo.
- Una sola entrega integral: terminar implementación, ejecutar pruebas globales, corregir fallos, obtener build y CI satisfactorios, preparar recuperación y luego pasar a Replit/publicación.

## Trabajo incorporado a GitHub en esta tanda
### HBG Authority y Code Tools
- CI de GitHub Actions añadido en `.github/workflows/hbg-universe-ci.yml`: PostgreSQL 16 de prueba, instalación congelada, provisionamiento de schema, validación del service worker/manifest, tests API y aplicación, typecheck y build.
- Rutas de concesiones de permisos registradas.
- Code Tools con inspección/listado, escritura y borrado de archivos; validación de rutas, traversal, symlinks, archivos y segmentos protegidos, límites de tamaño y protección de archivos críticos.
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
- Memoria de HBG Core con persistencia local comprobable, validación de datos, manejo de almacenamiento inaccesible/JSON corrupto y aviso visible cuando solo dura la sesión.
- Restauración del estado de ánimo guardado al iniciar Core.
- INSTINTO con respaldo/exportación e importación local, validación de contenido y pruebas asociadas.
- VIBRA con selección de reproducción determinista para shuffle/repeat, historial de shuffle alineado con reproducción, casos de pista única y modos repeat; controles y acciones conectados.
- Comandos de voz para shuffle/repeat conectados a las acciones de VIBRA y con pruebas de parser/ejecución.
- Manejo de error de Web Audio para que un fallo al crear el grafo de audio no silencie la reproducción base.

### PWA
- Service worker con caché de shell y assets estáticos, navegación offline y exclusión explícita de API/autenticación/respuestas dinámicas.
- Manifest y service worker incluidos en validaciones CI.

## Estado de verificación al guardar este checkpoint
- HEAD consultado: `2302e7765261d1dd5bb47fd891a32a585490c972`.
- GitHub Actions run `45067905914` para ese HEAD estaba `in_progress`, en inicialización de contenedores. No hay todavía resultado final de tests/typecheck/build en este checkpoint.
- El run anterior `45067746677` terminó `success`, pero corresponde a un SHA anterior (`3a8e6a59bf33f90c364eb0afd87105b03c75499b`) y no valida el HEAD actual.
- No se ha ejecutado una prueba integral de producción en el deployment de Replit.
- No declarar el producto listo para publicación hasta que CI del HEAD final esté verde, los fallos se corrijan y se verifique DB/migración/configuración del deployment real.

## Siguientes pasos obligatorios
1. Esperar y revisar el resultado de CI del HEAD actual; abrir logs de jobs si falla y corregir causas reales.
2. Revisar específicamente los contratos de grants y guards en cada operación Code Tools, incluidos límites de ruta, TOCTOU/symlinks y auditoría.
3. Confirmar que los scripts de pruebas cubren Authority, Code Tools, Terminador, Core/memoria, INSTINTO, VIBRA y voz; ampliar pruebas negativas de autorización.
4. Revisar coherencia entre migraciones/schema Drizzle y las tablas exigidas por health check; no ejecutar cambios destructivos sobre una DB real.
5. Completar las brechas funcionales restantes de UI/API y persistencia, sin inventar capacidades ni reemplazar módulos existentes.
6. Ejecutar CI después de cada corrección sustantiva y lograr un CI verde sobre el HEAD de entrega.
7. Crear punto de recuperación final; solo entonces incorporar en Replit, verificar variables, DB/schema, URL/API, autenticación y flujos reales, y conservar posibilidad de rollback.

Este archivo es un checkpoint de continuidad, no una declaración de finalización ni de publicación.
