# VIBRA PRO — biblioteca local y Auto DJ

## Principios obligatorios

- La biblioteca normal del reproductor permanece intacta: no se mueve, reemplaza ni reorganiza por Auto DJ.
- El usuario autoriza expresamente el acceso a audio del dispositivo antes del descubrimiento.
- Auto DJ mantiene un catálogo y análisis locales. No se suben canciones, blobs, huellas ni metadatos musicales a servidores externos.
- Los Mood Engine son clasificaciones y selecciones virtuales: una misma canción puede pertenecer a varias categorías sin duplicar el archivo.
- Rechazar o revocar el permiso no bloquea el reproductor ni la biblioteca normal.
- La revisión de duplicados es independiente y nunca elimina archivos sin confirmación.

## Estado web/PWA

La PWA no dispone de un permiso universal para recorrer todo el almacenamiento de Android. El selector de carpetas del navegador tampoco equivale al permiso global de audio. Por ello, la interfaz de selección manual de carpetas/escaneo se retiró del flujo de Auto DJ. La importación manual que ya existe en la biblioteca normal sigue siendo una función distinta.

La PWA puede analizar únicamente archivos que ya estén incorporados a su biblioteca local y que el navegador permita leer. No debe anunciar acceso completo al dispositivo ni análisis garantizado cuando la aplicación está cerrada.

## Requisito Android nativo pendiente

El repositorio aún no contiene un proyecto Android empaquetado ni un puente nativo MediaStore. Para cumplir el acceso autorizado a toda la biblioteca multimedia:

1. Añadir una capa Android mantenible y versionada, integrada con el mismo producto VIBRA.
2. Solicitar permiso explícito para audio: `READ_MEDIA_AUDIO` en Android 13+ y el permiso heredado correspondiente en versiones anteriores compatibles.
3. Consultar `MediaStore.Audio` solo después de la concesión del permiso.
4. Descubrir los tipos de audio disponibles sin filtrar por duración ni por el nombre del archivo. La compatibilidad real de reproducción/decodificación se valida por formato.
5. Importar o exponer archivos al almacenamiento privado de la app de forma segura y progresiva, sin convertir canciones completas a Base64 ni enviar contenido a la nube.
6. Registrar referencias/metadatos locales y evitar duplicar los archivos ya importados en la biblioteca normal.
7. Si el usuario deniega o revoca el permiso, detener el descubrimiento y mantener intacto el reproductor.
8. Probar en dispositivo Android real: permisos concedidos/denegados/revocados, archivos de varios formatos, almacenamiento grande, consumo, reproducción simultánea e interrupciones.

## Análisis local de Auto DJ

- Al activar Auto DJ o Modo Fiesta, el motor prioriza el análisis de la siguiente canción candidata.
- Después continúa con el resto de canciones pendientes cuando el hilo principal esté disponible.
- Reutiliza resultados guardados y evita volver a analizar pistas completas.
- El análisis usa procesamiento local y límites de memoria/tiempo; canciones no compatibles o demasiado largas pueden reproducirse normalmente aunque su análisis se omita.
- La reproducción normal no depende del análisis y no debe detenerse por una tarea de análisis.

## Despertar por voz — requisito de cierre

«Oye, VIBRA» debe activar el asistente de VIBRA sin pulsar la pantalla. La escucha en segundo plano requiere una implementación Android nativa explícita, permiso de micrófono, controles visibles de privacidad y pruebas de pantalla apagada/batería. No se debe fingir escucha permanente desde una PWA ni grabar audio continuamente sin autorización.

La PWA actual utiliza `SpeechRecognition` / `webkitSpeechRecognition` para la captura manual. Ese API no garantiza procesamiento local y puede depender del proveedor del navegador; por tanto, no cumple por sí solo el requisito final de voz sin servidores externos. La versión final debe usar reconocimiento y detección de palabra de activación en el dispositivo, sin fallback a servicios cloud. Si Android no dispone de reconocimiento offline, debe informar que la capacidad local no está disponible en vez de enviar audio a un tercero.

La activación común de «Oye, VIBRA», «Oye, INSTINTO» y «Oye, HBG» debe compartir una arquitectura de voz del Universo HBG, con enrutamiento al módulo correcto y sin mezclar permisos de uso con autoridad de desarrollo. El enrutamiento por frase ya puede reconocer los tres nombres durante una captura activa; eso no equivale todavía a escucha permanente ni a despertar con pantalla apagada.

## Criterios de aceptación

- La biblioteca normal y sus playlists sobreviven intactas a autorización, análisis y clasificación.
- No hay botón de «Escanear biblioteca» ni selector manual de carpetas como operación de Auto DJ.
- Mood Engine contiene referencias a canciones reales clasificadas localmente.
- Manos Libres responde a órdenes musicales sin pausar la canción; se aplica ducking temporal y se restaura el volumen.
- Auto DJ y Modo Fiesta no necesitan red ni servicios de terceros para seleccionar y reproducir música local.
- Duplicados permanece como herramienta separada.
- No se declara cierre Android hasta completar pruebas físicas en el teléfono objetivo.
