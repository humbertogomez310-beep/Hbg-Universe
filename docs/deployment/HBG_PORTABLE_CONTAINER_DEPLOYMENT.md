# Universo HBG — despliegue portable desde GitHub

Estado: preparación en rama aislada. Este documento no autoriza publicar, provisionar servicios, transferir datos ni ejecutar migraciones.

## Objetivo

Construir una sola imagen de contenedor desde el monorepo:

- Vite compila la PWA en `artifacts/universo-hbg/dist/public`.
- Express compila la API en `artifacts/api-server/dist/index.mjs`.
- Express sirve la PWA y la API desde el mismo origen. Las llamadas existentes a `/api` y las cookies de sesión permanecen same-origin.
- GitHub es la fuente del código. El proveedor de infraestructura solo construye y ejecuta la imagen.

El servidor sirve el frontend únicamente cuando existe el build. En desarrollo, si no existe `index.html`, la API conserva su comportamiento actual.

## Artefactos y comandos

Construcción local o CI:

```sh
pnpm install --frozen-lockfile
pnpm build
docker build -t universo-hbg:review .
```

Arranque del contenedor:

```sh
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e NODE_ENV=production \
  -e DATABASE_URL='(configurar en el gestor de secretos)' \
  -e HBG_OWNER_SECRET='(configurar en el gestor de secretos)' \
  universo-hbg:review
```

No incluir secretos en el comando real, terminal compartida, Dockerfile, GitHub ni logs. Configurarlos en el gestor de secretos del proveedor.

## Candidato de infraestructura sin cuota mensual

### Aplicación: Oracle Cloud Infrastructure Always Free

La opción que merece una prueba de capacidad para el servidor es una VM Ampere A1 dentro de los límites Always Free publicados por Oracle. A fecha de esta revisión, la cuota indicada equivale como máximo a 2 OCPU y 12 GB de memoria en total, más almacenamiento de bloque Always Free sujeto a límites y región.

Condiciones que impiden prometer disponibilidad permanente:

- La capacidad depende de la región de inicio y puede no estar disponible al crear la VM.
- Oracle puede recuperar instancias Always Free que considere inactivas. Su política evalúa, durante siete días, CPU, red y memoria (para A1) por debajo de los umbrales publicados.
- Requiere administrar Linux, actualizaciones, firewall, TLS, Docker y monitoreo.
- La cuenta Free Tier puede solicitar un método de pago para verificar identidad. No se debe cambiar a Pay As You Go ni aprovisionar recursos facturables para este proyecto.

Documentación oficial:
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/free/
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm

La VM no debe considerarse un SLA. Si Oracle no ofrece capacidad Always Free en la región, no seleccionar recursos de pago como alternativa automática.

### Base de datos: Neon PostgreSQL Free

Neon es candidato para PostgreSQL administrado, separado de la VM. La cuota publicada del plan gratuito incluye límites de proyectos, horas de cómputo, almacenamiento y transferencia; el cómputo escala a cero y puede suspenderse al agotar cuotas. Verificar el panel y los términos vigentes antes de usarlo con datos reales.

Documentación oficial:
- https://neon.com/docs/introduction/plans
- https://neon.com/docs/introduction/scale-to-zero
- https://neon.com/docs/connect/connect-from-any-app

La aplicación utiliza `pg` y `DATABASE_URL`. Usar la cadena PostgreSQL apropiada de Neon, preferentemente pooled para la aplicación cuando corresponda. No guardar la cadena en el repositorio.

## Secretos y configuración de producción

Configurar en el gestor de secretos del proveedor:

- `DATABASE_URL`: cadena de conexión de la base de producción.
- `HBG_OWNER_SECRET`: credencial bootstrap del OWNER existente, con al menos 16 caracteres.
- `PORT`: puerto HTTP asignado por el proveedor (el contenedor usa 8080 por defecto).
- `NODE_ENV=production`.
- `OPENAI_API_KEY` y `OPENAI_MODEL`: opcionales, solo si se habilita el proveedor remoto de HBG Core.

No sustituir ni recrear la identidad OWNER para resolver problemas de autenticación. La credencial bootstrap no es una orden para crear otra identidad.

## Migración de datos — prohibido automatizar

Antes de trasladar cualquier dato:

1. Identificar qué base contiene los datos vigentes y quién es su propietario.
2. Obtener un respaldo PostgreSQL verificable con `pg_dump`.
3. Verificar que el respaldo puede restaurarse en una base temporal aislada.
4. Comparar tablas, columnas, índices, constraints, migraciones aplicadas y registro OWNER con el esquema versionado de HBG.
5. Confirmar explícitamente el destino y autorizar la transferencia.
6. Importar primero a una base vacía de ensayo, validar recuentos y relaciones.
7. Ejecutar `pnpm --filter @workspace/db migrate` solo después de validar respaldo y compatibilidad.

Nunca usar `drizzle push` ni `push-force` en producción. Nunca copiar la base de desarrollo de Replit sobre otra base sin respaldo y autorización expresa. Este contenedor no ejecuta migraciones al arrancar.

## Pruebas antes de cualquier publicación

- `GET /api/healthz` responde 200 cuando la base y el esquema HBG están listos.
- `GET /api/auth/me` sin sesión no autentica.
- Login con el OWNER preexistente.
- Sesiones normales y sesiones de desarrollo: creación, expiración y revocación.
- Guards de HBG Authority y permisos de Code Tools.
- Auditoría de acciones sensibles.
- TERMINADOR: propuesta, aprobación y ejecución limitada.
- Persistencia de HBG Core, INSTINTO y VIBRA.
- PWA: manifest, service worker, shell offline y navegación desde móvil/escritorio.
- Cookies seguras, TLS, CORS same-origin, reinicio del contenedor y recuperación tras suspensión de la base.
- Restauración del respaldo probada.

## Estado de esta preparación

- No se ha creado ninguna cuenta ni recurso en Oracle o Neon.
- No se ha leído, copiado ni modificado ninguna base de datos.
- No se han añadido secretos.
- No se ha publicado ninguna imagen o aplicación.
- La rama no cambia `main`.
- La migración solo puede avanzar después de revisión del diff, CI y autorización expresa para el proveedor y el traslado de datos.
