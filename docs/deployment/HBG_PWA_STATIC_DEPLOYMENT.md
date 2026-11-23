# Publicación estática de Universo HBG (PWA Local-first)

## Objetivo

Publicar la PWA sin Replit Core, sin un proceso Node permanente y sin depender de una base de datos para las funciones locales. La primera publicación estática sirve la interfaz, los recursos instalables y el Service Worker. Los servicios centralizados quedan explícitamente deshabilitados en este build.

## Proveedor previsto

Cloudflare Pages, conectado directamente al repositorio GitHub. Se usa Pages como hosting estático; no se requiere Cloudflare Worker para el primer release Local-first.

Documentación oficial:
- https://developers.cloudflare.com/pages/
- https://developers.cloudflare.com/pages/configuration/build-configuration/
- https://developers.cloudflare.com/pages/configuration/headers/

## Configuración de build

- Framework preset: None
- Root directory: `/`
- Build command:

```bash
pnpm install --frozen-lockfile && VITE_HBG_API_ENABLED=false pnpm --dir artifacts/universo-hbg run build
```

- Build output directory: `artifacts/universo-hbg/dist/public`
- Node.js: 24
- Production branch: inicialmente `local-first/pwa-completion` para validar; después del review y merge, `main`.

El build estático no ejecuta migraciones, no conecta a PostgreSQL y no necesita secretos. No configurar `DATABASE_URL`, `HBG_OWNER_SECRET` ni claves de IA en el entorno de Pages para esta primera publicación.

## Comportamiento de esta edición

- La PWA, el shell, el manifest, los iconos, JS y CSS se sirven como archivos estáticos.
- Tras una primera carga online correcta, el Service Worker precarga el shell y los recursos principales para permitir la apertura offline.
- INSTINTO, VIBRA y HBG Core conservan sus capacidades locales y sus datos en el almacenamiento del dispositivo.
- Las llamadas remotas de HBG Core no se intentan cuando `VITE_HBG_API_ENABLED=false`.
- El login OWNER no acepta una identidad local: queda bloqueado si el API remoto no está habilitado.
- Las operaciones privilegiadas de TERMINADOR no se ejecutan sin el servidor y la autorización server-side de HBG Authority.
- No existe sincronización multi-dispositivo en esta edición. Los respaldos exportables siguen siendo el mecanismo de transferencia de datos disponible.

## Pruebas de aceptación antes de compartir públicamente

1. Abrir la URL publicada y comprobar que carga sin errores.
2. Instalar la PWA desde Chrome/Edge y Safari compatible.
3. Abrir cada módulo, crear datos de prueba y reiniciar la aplicación.
4. Desconectar la red, cerrar y volver a abrir la PWA.
5. Comprobar que INSTINTO conserva y permite editar notas, letras y proyectos.
6. Comprobar que VIBRA conserva biblioteca local, audio importado, playlists y preferencias.
7. Comprobar que HBG Core conserva memoria y ejecuta comandos locales.
8. Confirmar que el chat remoto informa que no está disponible y que no realiza llamadas API.
9. Confirmar que login OWNER y operaciones de TERMINADOR quedan bloqueados sin conexión/backend.
10. Actualizar el Service Worker y confirmar que los datos del usuario permanecen intactos.

Las pruebas automatizadas de CI no sustituyen las pruebas de instalación/offline en dispositivos reales.

## Límites y evolución

Esta publicación entrega una PWA local-first, no todas las capacidades centralizadas del ecosistema. Para habilitar login OWNER, HBG Authority remoto, auditoría centralizada, IA remota y operaciones de TERMINADOR se necesitará posteriormente un backend seguro y disponible. Ese backend se puede incorporar como servicio opcional sin convertirlo en requisito para las funciones locales.

No anunciar sincronización automática, control remoto de dispositivos ni ejecución privilegiada offline hasta que esas funciones existan y pasen sus pruebas de seguridad.
