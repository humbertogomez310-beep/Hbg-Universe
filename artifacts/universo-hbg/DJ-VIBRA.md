# DJ VIBRA: estado de implementación

## Capacidades conectadas

- VIBRA sigue siendo responsable del audio y de la biblioteca IndexedDB; DJ VIBRA dirige la sesión a través de acciones registradas en HBG Core. El módulo permanece montado y oculto al navegar a otras pantallas para no detener el reproductor.
- El objetivo musical se conserva en `localStorage` durante la sesión y prioriza órdenes explícitas.
- Auto DJ selecciona únicamente pistas de la biblioteca local cuyos títulos, artistas o álbumes coinciden con el objetivo. Evita las pistas recientes cuando hay alternativas y prueba otras pistas si una no carga.
- Modo Fiesta PRO activa Auto DJ y registra la preferencia de energía; no hace mezclas ni análisis de audio.
- Manos Libres reutiliza la captura de voz existente y se presenta desde el shell común. Durante la escucha baja temporalmente a 25 % el volumen del elemento de audio y lo restaura al detener, completar o cancelar la captura, incluido el timeout de 15 segundos.
- Las playlists conservan IDs de pistas locales y admiten creación desde coincidencias textuales, añadir, quitar, reordenar, sustituir y reproducir. No se crean canciones ficticias.
- Las selecciones y cambios manuales invalidan cargas automáticas pendientes.

## Límites conocidos

- No hay fuente musical online integrada; la búsqueda, selección y playlists son locales.
- La biblioteca no guarda género, año, BPM ni energía. Las coincidencias de objetivo son textuales; no se puede garantizar compatibilidad musical basada en metadatos ausentes.
- Mood Engine, análisis de ambiente, Karaoke, transiciones profesionales e intervenciones habladas de DJ no están conectados.
- El reconocimiento de voz depende de `SpeechRecognition` / `webkitSpeechRecognition` del navegador. La captura no pausa el reproductor; el ducking solo ajusta el volumen del elemento HTMLAudioElement de VIBRA.
- La continuidad de reproducción y el comportamiento del micrófono requieren validación en navegador y dispositivo real; las pruebas automatizadas no sustituyen esa verificación.

## Verificaciones

- `pnpm --filter @workspace/universo-hbg test`
- `pnpm --filter @workspace/universo-hbg typecheck`
- `pnpm run build`
