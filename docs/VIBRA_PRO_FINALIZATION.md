# VIBRA PRO — ocho puntos de cierre

Este documento fija el alcance final. No se agregan módulos nuevos fuera de estos ocho puntos sin una decisión posterior del OWNER.

## 1. Estabilidad del reproductor

- Mantener la biblioteca normal, la cola, las playlists, favoritos y posición de reproducción.
- Los análisis usan procesamiento offline/local y límites de memoria.
- Un archivo que no pueda analizarse sigue pudiendo reproducirse.
- Validar que análisis y permisos no interrumpan VIBRA ni el audio de otras aplicaciones.

Estado: correcciones de estabilidad y límites de análisis están en la base de trabajo; CI de tests, typecheck y builds pasó. Validación física Android pendiente.

## 2. Permiso y descubrimiento de audio Android

- Pedir autorización explícita antes de consultar la biblioteca multimedia.
- En Android, usar MediaStore y los permisos de audio adecuados a la versión del sistema.
- Descubrir archivos de audio de distintos formatos; no filtrar por duración ni por nombres de notas de voz.
- No mover, borrar ni reorganizar archivos originales.
- Si el permiso se deniega/revoca, el reproductor normal sigue funcionando.
- La PWA no simula acceso global ni ofrece selector manual de carpetas como tarea de Auto DJ.

Estado: especificación documentada. Falta la aplicación Android nativa y el puente MediaStore; no existe en esta rama.

## 3. Catálogo y análisis automático local

- Auto DJ crea un catálogo local de las canciones autorizadas.
- Al activarse Auto DJ, prioriza la siguiente candidata de transición y luego procesa el resto en tiempo ocioso.
- Reutiliza resultados persistidos y clasifica sin volver a decodificar audio ya analizado.
- No sube audio ni metadatos a servidores externos.

Estado: cola automática priorizada y pruebas unitarias añadidas; pruebas automatizadas CI pasaron.

## 4. Mood Engine funcional

- Cada canción puede tener varias clasificaciones simultáneas.
- Los ambientes principales son selecciones reales, no cambios de color.
- Los criterios medibles incluyen BPM, pulso, energía, impacto y tonalidad.
- Los escenarios como cumpleaños, niños, tomar y festejar requieren etiquetas o metadatos fiables.
- Las inferencias de ánimo son heurísticas locales con confianza; BPM y tonalidad por sí solos no demuestran una emoción humana.

Estado: clasificador local explicable, categorías, selección por voz/botones y pruebas automatizadas CI pasaron; requiere ajuste con biblioteca real y pruebas físicas.

## 5. Auto DJ y Modo Fiesta

- Auto DJ usa la clasificación Mood Engine para ordenar candidatas.
- Modo Fiesta puede combinar toda la biblioteca y variar la energía según instrucciones.
- Debe preservar reproducción, ducking y restauración de volumen durante las órdenes habladas.
- No debe pausar la canción por analizar o escuchar.

Estado: selección por Mood Engine y escenarios integrada en el flujo de selección; transición y continuidad requieren pruebas reales prolongadas.

## 6. Manos Libres y activación por voz del Universo HBG

- Frases objetivo: «Oye, VIBRA», «Oye, INSTINTO» y «Oye, HBG».
- El reconocimiento de cada frase debe enrutar al módulo correcto.
- El motor final debe ser local, sin enviar audio a servicios externos.
- La escucha en segundo plano requiere servicio Android nativo, permiso explícito, notificación visible y controles para activar/desactivar.
- La PWA no promete escucha permanente ni activación con pantalla apagada.
- El reconocimiento Web Speech actual no garantiza ejecución local; no se acepta como implementación final de manos libres.

Estado: LINGUA y la barra de voz reconocen/enrutan el destino cuando ya existe una captura activa. Falta motor local nativo y activación real con pantalla apagada.

## 7. Validación técnica y física

- Ejecutar tests, typecheck, build de producción y validación PWA.
- Probar formatos, biblioteca grande, permisos concedidos/denegados/revocados, consumo de batería, audio externo, ducking, reproducción con pantalla apagada y reanudación.
- Validar en Android real; los tests web no sustituyen pruebas del sistema operativo.

Estado: tests, typecheck, build de producción y build PWA pasaron en CI (run 495); pruebas físicas pendientes.

## 8. Cierre y distribución

- No integrar en producción ni publicar sin autorización explícita del OWNER.
- Mantener los dos respaldos previos a la etapa.
- Solo cerrar cuando los ocho puntos tengan pruebas satisfactorias y no queden bloqueos nativos.
- Entregar una versión Android instalable y verificable, con permisos y privacidad claros.

Estado: pendiente. PR #52 sigue en borrador; no hay merge ni despliegue autorizado.
