# DJ VIBRA: estado de implementación

## Capacidades conectadas

- Auto DJ y Modo Fiesta PRO comparten una única consola DJ VIBRA. Auto DJ es el motor de conducción; Fiesta PRO es un perfil de energía dentro de esa misma consola. La activación de cualquiera de los dos mediante las acciones `music.autoDj` o `music.party` abre la consola. El panel muestra el espectro real cuando Web Audio está disponible, pista actual, siguiente candidata y dirección musical.

- VIBRA sigue siendo responsable del audio y de la biblioteca IndexedDB; DJ VIBRA dirige la sesión a través de acciones registradas en HBG Core. El módulo permanece montado y oculto al navegar a otras pantallas para no detener el reproductor.
- El objetivo musical se conserva en `localStorage` durante la sesión y prioriza órdenes explícitas.
- Auto DJ selecciona pistas de la biblioteca local según la intención explícita, evita las recientes y, cuando hay análisis con confianza suficiente, prioriza compatibilidad de BPM y tonalidad. La elección de Auto DJ es determinista, no aleatoria; si faltan datos usa el orden estable de la biblioteca.
- La importación inicia análisis local asíncrono de BPM y tonalidad mediante Web Audio; los resultados y su confianza se guardan en IndexedDB. Si el navegador no puede decodificar el formato, la canción sigue siendo reproducible y los campos quedan ausentes.
- Manos Libres reutiliza la captura de voz existente y se presenta desde el shell común. Durante la escucha el AudioManager atenúa la rama musical al 55 % del volumen maestro y restaura el nivel al terminar; los buses reservados para voz DJ y efectos ceden prioridad mientras habla el usuario.
- Las playlists conservan IDs de pistas locales y admiten creación desde coincidencias textuales, añadir, quitar, reordenar, sustituir y reproducir. No se crean canciones ficticias.
- Las selecciones y cambios manuales invalidan cargas automáticas pendientes.

## Límites conocidos

- No hay fuente musical online integrada; la búsqueda, selección y playlists son locales.
- La biblioteca conserva estimaciones BPM/tonalidad cuando se pueden calcular, pero no se infiere género, año, energía ni estructura musical. La calidad de las estimaciones debe validarse con archivos reales y no se usan cuando su confianza es baja.
- El motor de dos decks ya está conectado al flujo principal de reproducción cuando Auto DJ o Fiesta están activos. Precarga la siguiente pista en el deck inactivo y lanza un crossfade equal-power al acercarse el final de la canción; ambas pistas se superponen y el deck saliente se libera al completar la transición. La duración se ajusta al tiempo restante para reducir cortes. La consola informa preparación, deck listo y mezcla en curso. Las listas de reproducción manuales y el modo repetir una pista conservan su comportamiento y no se interrumpen con el crossfade.
- BPM y tonalidad se usan para ordenar candidatas, no para modificar todavía la velocidad de reproducción. Beatmatching, sincronización de compases, key-lock/time-stretch, Mood Engine, análisis de ambiente, Karaoke, voces originales de DJ y efectos originales preinstalados siguen pendientes. Los buses DJ Voice y DJ FX están preparados pero aún no tienen fuentes de audio conectadas. El reconocimiento de voz depende de `SpeechRecognition` / `webkitSpeechRecognition` del navegador.
- Si Web Audio no está disponible, VIBRA conserva un reproductor de un solo deck como fallback; el crossfade de dos decks requiere AudioContext y MediaElementAudioSourceNode.
- La continuidad de reproducción, la mezcla audible, la política de autoplay y el comportamiento del micrófono requieren validación en navegador y dispositivo real; las pruebas automatizadas con audio simulado no sustituyen esa verificación.

## Verificaciones

- `pnpm --filter @workspace/universo-hbg test`
- `pnpm --filter @workspace/universo-hbg typecheck`
- `pnpm run build`
