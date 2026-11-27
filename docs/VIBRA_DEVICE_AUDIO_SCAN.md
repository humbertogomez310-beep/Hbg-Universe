# VIBRA — descubrimiento de biblioteca de audio

## Estado implementado en la PWA

- El usuario autoriza explícitamente una carpeta mediante el selector del navegador.
- VIBRA recorre la carpeta y sus subcarpetas automáticamente.
- Solo se consideran extensiones de audio compatibles: MP3, WAV, OGG, FLAC, AAC y M4A.
- No se abre la galería de imágenes ni se exige marcar canciones individualmente.
- Los archivos permanecen en el dispositivo y se incorporan a la biblioteca local existente.
- Si el usuario cancela el selector, no se inicia ningún escaneo.

## Límite de la PWA

La autorización de una carpeta no equivale a permiso para recorrer todo el almacenamiento multimedia de Android. El navegador puede no ofrecer un selector de directorios y no expone un permiso web general para consultar toda la biblioteca del dispositivo. En ese caso, la PWA usa el selector de carpeta compatible del navegador cuando está disponible; no debe simular un acceso global.

## Requisito para el escaneo completo de Android

Para cumplir el flujo de «Escanear dispositivo» sin que el usuario tenga que elegir una carpeta, VIBRA necesita una aplicación Android empaquetada con una capa nativa. Esa capa debe:

1. Declarar y solicitar `android.permission.READ_MEDIA_AUDIO` en Android 13 o posterior.
2. Usar `READ_EXTERNAL_STORAGE` solo para las versiones Android antiguas que lo requieran.
3. Consultar `MediaStore.Audio` después de que el usuario conceda el permiso.
4. Devolver metadatos y acceso local a los archivos, sin subir el contenido al servidor.
5. Copiar o exponer cada archivo de forma segura al almacenamiento local de la app para incorporarlo a IndexedDB, procesando uno por uno y evitando pasar canciones completas como base64 por el puente JavaScript.
6. Mostrar progreso, cantidad encontrada, omitidas y errores; permitir cancelar y reintentar.
7. Tratar permiso denegado como estado normal: no escanear y explicar cómo volver a concederlo.

## Bloqueo actual

El repositorio todavía no contiene un proyecto Capacitor/Android ni un puente nativo `MediaStore`. Por tanto, la implementación web actual permite escaneo masivo de una carpeta autorizada, pero **no debe anunciarse como escaneo automático de toda la biblioteca Android**. La integración nativa y su prueba física en el dispositivo Android objetivo siguen pendientes.
