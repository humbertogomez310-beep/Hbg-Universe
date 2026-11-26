# DJ VIBRA: estado de implementación

## Capacidades conectadas

- Auto DJ y Modo Fiesta PRO comparten una única consola DJ VIBRA. Auto DJ es el motor de conducción; Fiesta PRO es un perfil de energía dentro de esa misma consola. La activación de cualquiera de los dos mediante las acciones `music.autoDj` o `music.party` abre la consola. El panel muestra el espectro real cuando Web Audio está disponible, pista actual, siguiente candidata y dirección musical.

- VIBRA sigue siendo responsable del audio y de la biblioteca IndexedDB; DJ VIBRA dirige la sesión a través de acciones registradas en HBG Core. El módulo permanece montado y oculto al navegar a otras pantallas para no detener el reproductor.
- El objetivo musical se conserva en `localStorage` durante la sesión y prioriza órdenes explícitas.
- Auto DJ selecciona pistas de la biblioteca local según la intención explícita, evita las recientes y, cuando hay análisis con confianza suficiente, prioriza compatibilidad de BPM y tonalidad. La elección de Auto DJ es determinista, no aleatoria; si faltan datos usa el orden estable de la biblioteca.
- La importación inicia análisis local asíncrono de BPM y tonalidad mediante Web Audio; los resultados y su confianza se guardan en IndexedDB. Si el navegador no puede decodificar el formato, la canción sigue siendo reproducible y los campos quedan ausentes.
- Manos Libres reutiliza la captura de voz existente y se presenta desde el shell común. Durante la escucha baja temporalmente a 25 % el volumen del elemento de audio y lo restaura al detener, completar o cancelar la captura, incluido el timeout de 15 segundos.
- Las playlists conservan IDs de pistas locales y admiten creación desde coincidencias textuales, añadir, quitar, reordenar, sustituir y reproducir. No se crean canciones ficticias.
- Las selecciones y cambios manuales invalidan cargas automáticas pendientes.

## Límites conocidos

- No hay fuente musical online integrada; la búsqueda, selección y playlists son locales.
- La biblioteca conserva estimaciones BPM/tonalidad cuando se pueden calcular, pero no se infiere género, año, energía ni estructura musical. La calidad de las estimaciones debe validarse con archivos reales y no se usan cuando su confianza es baja.
- Se añadió un motor de dos decks con buses separados para música, voz DJ y efectos, además de curvas equal-power para crossfade. Todavía no está conectado al flujo de reproducción de VIBRA: no hay transición audible activa, beatmatching ni key-lock/time-stretch.
- Mood Engine, análisis de ambiente, Karaoke, intervenciones habladas de DJ y efectos originales preinstalados siguen pendientes. El reconocimiento de voz depende de `SpeechRecognition` / `webkitSpeechRecognition` del navegador.
- La continuidad de reproducción y el comportamiento del micrófono requieren validación en navegador y dispositivo real; las pruebas automatizadas no sustituyen esa verificación.

## Verificaciones

- `pnpm --filter @workspace/universo-hbg test`
- `pnpm --filter @workspace/universo-hbg typecheck`
- `pnpm run build`
