# Despliegue en Railway: staging y producción

> **Preparación en curso:** ambos Dockerfiles de producción están preparados en el árbol de trabajo de `feat/phase-08-staging` y sus builds locales pasaron el 17 de noviembre de 2026; siguen sin commit y el repositorio actual no se ha desplegado ni aceptado en Railway. Esta guía no acredita configuración de servicios, secretos, dominios, Resend ni recorridos completos.

Esta guía describe la preparación de Railway desde cero. La configuración del proyecto actual y su recorrido completo en staging están pendientes de verificar; cada entorno necesita sus propias credenciales, dominios y remitentes. Las credenciales y los valores efectivos de esos entornos no se guardan en el repositorio.

Crear servicios, conectar el repositorio, configurar variables, añadir dominios o desplegar son cambios externos y requieren autorización explícita antes de aplicarse. Revisa el comportamiento de autodespliegue al conectar la rama: un push posterior puede iniciar un despliegue sin otra acción manual. En Railway inspecciona y aprueba la vista de cambios staged sólo después de la autorización correspondiente.

Antes de configurar staging, completa el [entorno local](../docker/COMPOSE.md) y prueba [Stripe en local](STRIPE.md). Usa la guía de [Cloudflare R2](R2.md) para crear un bucket dedicado de staging, separado del bucket local y de producción. La cuenta, dominio, remitentes, límites y envío real de Resend se revisan en staging siguiendo [Resend](RESEND.md); no configures Resend en Compose. No necesitas cambiar los *nameservers* para usar dominios públicos de Railway en staging.

## Por qué existen Dockerfiles de producción

Los Dockerfiles normales y Compose ejecutan servidores de desarrollo con observación de cambios. `frontend/Dockerfile.production` construye Next.js con `npm run build` y arranca `next start`; `backend/Dockerfile.production` instala Prisma CLI, genera Prisma Client y arranca la API. El worker comparte la imagen del backend, pero usa `node src/worker.js` como comando de inicio. Las imágenes de este proyecto usan Node.js `24.21.0-bookworm-slim` y ejecutan como usuario `node`. Railway debe usar `Dockerfile.production` mediante `RAILWAY_DOCKERFILE_PATH`; los argumentos Docker `MEDIA_BASE_URL` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY` se requieren al construir el frontend. El primero configura la lista de imágenes remotas y el segundo se incorpora al bundle público, así que el frontend se reconstruye cuando cambien. [Dockerfiles de Railway](https://docs.railway.com/builds/dockerfiles), [variables de entorno de Next.js](https://nextjs.org/docs/app/guides/environment-variables).

## Servicios

Railway puede importar servicios compatibles desde un archivo Compose, pero no todas las opciones de Compose tienen equivalente en la plataforma. Para este proyecto configura y revisa estos servicios en el lienzo de Railway; no copies los puertos publicados ni los bind mounts de desarrollo.

| Servicio Railway | Código / recurso | Exposición | Dockerfile |
|---|---|---|---|
| `postgres` | PostgreSQL de Railway con volumen | Sólo red privada | Plantilla PostgreSQL; respaldos se configuran por separado |
| `api` | `backend/` | Dominio público para Stripe y red privada para los demás servicios; el frontend de producción usa su proxy | `backend/Dockerfile.production` |
| `worker` | `backend/` | Sólo red privada | `backend/Dockerfile.production` |
| `frontend` | `frontend/` | Dominio público | `frontend/Dockerfile.production` |

`worker` usa la misma imagen que `api`, con un comando de inicio distinto. No despliegues Mailpit en Railway: es sólo para desarrollo local. Railway permite importar servicios de Compose, aunque el soporte de sus opciones es parcial; aquí se configura explícitamente cada servicio para revisar su imagen, red y variables.

## 1. Preparar Staging y seguir el orden de arranque

Usa los nombres exactos `postgres`, `api`, `worker` y `frontend`: las referencias `${{servicio.VARIABLE}}` de las plantillas dependen de ellos. Selecciona **Staging** antes de cada operación. Production se prepara después, según la sección 6; no dupliques todavía secretos ni recursos productivos.

### 1.1 Preparar código y servicios sin iniciar la aplicación

1. Comprueba que la rama elegida en GitHub contiene los Dockerfiles de producción, migraciones y cambios que se van a desplegar. Railway no recibe los cambios locales sin publicar. Anota el commit objetivo y comprueba CI y build antes de continuar.
2. Crea el proyecto y el entorno Staging. Añade PostgreSQL desde la plantilla, renombra el servicio a `postgres` y conserva su volumen y variables generadas. Espera a que esté activo. No pegues credenciales locales ni reemplaces las contraseñas que genera Railway.
3. Crea los servicios vacíos `api`, `worker` y `frontend`. Configura repositorio, rama, Root Directory y Dockerfile según las secciones 2–4 antes de desplegar. Si conectar el repositorio dispara un intento automático incompleto, no lo uses como evidencia de fallo de la aplicación: completa configuración y vuelve a desplegar. Revisa los cambios pendientes antes de aplicarlos.
4. En Networking genera un dominio público para API y frontend, con **Target Port 3000**. Las plantillas fijan `PORT=3000` en ambos. Si el panel todavía no ofrece generar un dominio, completa el arranque inicial descrito abajo antes de configurar las referencias que dependen de él.
5. Anota los dos dominios. Deben existir antes de resolver `frontend.RAILWAY_PUBLIC_DOMAIN`, configurar Turnstile y registrar el webhook de Stripe. Comprueba los valores resueltos de las referencias en Variables.

**Si el panel exige un primer despliegue para asignar dominios:** inicia API con `FRONTEND_ORIGIN=https://bootstrap.invalid`, Checkout apagado y sin permitir usuarios; tras generar su dominio, configura frontend con su URL privada y las variables públicas de medios y Turnstile. Ese primer frontend permite obtener su dominio, pero todavía no acredita login, correo ni catálogo. Autoriza ese hostname en Turnstile, reemplaza el origen temporal de API por la referencia definitiva y configura Worker. Vuelve al orden 1.4 para las comprobaciones y reconstruye frontend después de cargar el catálogo. No conserves el origen temporal ni uses esta fase de arranque para probar compras.

La red privada sólo conecta servicios del mismo proyecto y entorno. Esta aplicación escucha en IPv4 (`0.0.0.0`): usa un entorno nuevo con red privada IPv4/IPv6. Si reutilizas uno antiguo sólo IPv6, verifica su compatibilidad antes de desplegar; un dominio privado por sí solo no demuestra conectividad. [Red privada de Railway](https://docs.railway.com/networking/private-networking/how-it-works).

### 1.2 Preparar proveedores antes de pegar variables

| Preparación | Acción y resultado que debes tener |
|---|---|
| R2 | Crea un bucket exclusivo de Staging y carga manualmente todos los archivos del [inventario R2](R2.md#inventario-de-medios), con las carpetas y claves exactas. Habilita una URL pública HTTPS y abre una imagen concreta del hero y una de catálogo. Copia sólo el origen, sin `/images`, query ni barra final. `r2.dev` sirve para pruebas limitadas; producción requiere dominio personalizado. La app sólo lee medios públicos: no necesita tokens R2 ni credenciales S3 en Railway. |
| Resend | Sigue [Resend](RESEND.md) para verificar el dominio/subdominio de envío y sus registros en el DNS autoritativo, conservando MX y registros existentes. Prepara dos remitentes autorizados (`MAIL_FROM` y `RESEND_FROM`) y una clave exclusiva de Staging con permiso de envío, restringida al dominio cuando sea posible. Sólo el Worker recibe esa clave. Verifica cuotas y usa destinatarios de prueba autorizados. |
| Turnstile | Crea el widget de Staging y autoriza el hostname del frontend, sin protocolo ni ruta. Obtén site key y secret key; la primera va en frontend, la segunda sólo en API. Consulta [Turnstile de staging](#turnstile-de-staging). |
| Stripe test | Obtén `sk_test_…` del sandbox. Crea el destino HTTPS en `https://<dominio-api>/api/webhooks/stripe` para los cuatro eventos de la sección 5 y copia su `whsec_…`. Puede registrarse antes de que la API esté activa; comprueba las entregas después. No reutilices el secreto de `stripe listen`. |

### 1.3 Pegar las plantillas del Raw Editor

En **cada servicio → Variables → Raw Editor**, pega su bloque completo de las secciones siguientes. Usa formato `.env`, una línea `CLAVE=VALOR`; conserva literalmente `${{…}}`, que es sintaxis de referencia de Railway. Sustituye todos los valores `REEMPLAZAR_…` antes de guardar. Las comillas de los remitentes conservan sus espacios. No pegues el bloque en variables compartidas del proyecto: mezclaría secretos entre servicios.

Las opciones Root Directory, Start Command, Pre-deploy y Healthcheck se configuran en Settings; pegarlas como variables no las configura. `RAILWAY_DOCKERFILE_PATH` y `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` sí son variables de Railway. Consulta [Raw Editor y referencias](https://docs.railway.com/variables) y [variables de plataforma](https://docs.railway.com/variables/reference).

### 1.4 Desplegar por dependencias

Configura primero las tres aplicaciones con las secciones 2–4. Luego ejecuta este orden; no avances si falla la comprobación de una etapa:

| Orden | Acción | Comprobación antes de continuar |
|---|---|---|
| 1 | PostgreSQL activo | Volumen presente y referencia privada `postgres.DATABASE_URL` resuelta. |
| 2 | Desplegar API | Pre-deploy termina sin errores y `/health` devuelve 200 con `database=connected`. `/api/cart/account` sin sesión devuelve 401, no 404. `/api/public-config` muestra `checkoutEnabled: true` en Staging test. |
| 3 | Cargar catálogo SQL de la sección 5 | `/api/catalog/products` devuelve tres fichas y sus imágenes HTTPS correctas. Hazlo antes de desplegar frontend: el catálogo exitoso se cachea y podría quedar vacío si construyes/abres antes de cargar datos. |
| 4 | Desplegar Worker | Log de conexión a PostgreSQL; sin errores de remitentes o credencial. No configurar healthcheck HTTP en un proceso sin servidor web. |
| 5 | Construir y desplegar frontend | `/` carga por HTTPS, muestra catálogo y medios, y `/api/backend/public-config` devuelve el estado de API a través de la red privada. |
| 6 | Aceptar integraciones | Registro y correo de confirmación, login, recuperación, carrito, Stripe test, webhook, pedido y correo con PDF según sección 5. |

Si se cambia el origen R2 o la site key, reconstruye frontend. Si se cambia un secreto de API/Worker, vuelve a desplegar el servicio correspondiente. Conserva una sola réplica inicial de cada aplicación hasta revisar presupuesto de conexiones y consumo; esto no define un dimensionamiento de producción.

## 2. Configurar API

En el servicio `api`, selecciona el repositorio y configura:

- **Root Directory:** `/backend`; Railway construye desde esta carpeta.
- **Dockerfile Path:** `Dockerfile.production` mediante la variable de servicio `RAILWAY_DOCKERFILE_PATH`.
- **Start Command:** `node src/server.js`
- **Healthcheck Path:** `/health`
- **Pre-deploy Command:** `npm run prisma:migrate:deploy`
- **Dominio público:** sí; Stripe necesita alcanzar el webhook. En el Dockerfile de producción, las peticiones del navegador pasan por el proxy del frontend hacia la API privada.

El pre-deploy ejecuta las migraciones existentes antes de arrancar la API. El Dockerfile instala Prisma CLI para que ese comando esté disponible. No pongas la migración también en `worker`: se ejecuta una vez en `api` para evitar que ambos procesos compitan al iniciar.

Configura las siguientes variables en el servicio `api` de cada entorno:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000`, definido explícitamente para que la referencia privada del frontend y el Target Port coincidan. |
| `DATABASE_URL` | `${{postgres.DATABASE_URL}}` |
| `FRONTEND_ORIGIN` | `https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}` |
| `MEDIA_BASE_URL` | URL HTTPS pública del bucket correspondiente al entorno. |
| `STRIPE_MEDIA_BASE_URL` | La misma URL HTTPS de medios para que Stripe descargue las imágenes del checkout. |
| `CHECKOUT_ENABLED` | `true` sólo en Staging para aceptar pruebas. En Production debe quedar `false` o sin definir hasta la autorización expresa. La API publica este estado en `/api/public-config`; con el valor `false`, la tienda deshabilita el botón de agregar al carrito y muestra “Próximamente”. El backend sigue rechazando nuevas sesiones de Checkout y reintentos. |
| `STRIPE_MODE` | `test` en Staging. Mantén el modo de prueba durante toda la preparación. |
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe del entorno. En staging usa `sk_test_…`. |
| `STRIPE_WEBHOOK_SECRET` | Secreto de firma `whsec_…` del endpoint de ese entorno. |
| `TURNSTILE_SECRET_KEY` | Clave secreta del widget Turnstile de staging; sólo se configura en `api`. |

### Plantilla API — Raw Editor

```env
NODE_ENV=production
PORT=3000
RAILWAY_DOCKERFILE_PATH=Dockerfile.production
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
DATABASE_URL=${{postgres.DATABASE_URL}}
FRONTEND_ORIGIN=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
MEDIA_BASE_URL=REEMPLAZAR_ORIGEN_HTTPS_R2_STAGING
STRIPE_MEDIA_BASE_URL=REEMPLAZAR_ORIGEN_HTTPS_R2_STAGING
CHECKOUT_ENABLED=true
STRIPE_MODE=test
STRIPE_SECRET_KEY=REEMPLAZAR_CLAVE_SK_TEST
STRIPE_WEBHOOK_SECRET=REEMPLAZAR_SECRETO_WHSEC_DEL_DESTINO_STAGING
TURNSTILE_SECRET_KEY=REEMPLAZAR_SECRETO_TURNSTILE_STAGING
```

Ambas URL de medios deben coincidir. La API no necesita clave de Resend, site key pública de Turnstile ni credenciales de escritura R2.

### Límites de ejecución

Los límites actuales están definidos en `backend/src/database/prisma-client.js`; no son variables de entorno nuevas:

| Límite por proceso | Valor | Propósito |
|---|---|---|
| Conexiones PostgreSQL | 5 | Acotar el pool de cada API y Worker. |
| Espera para obtener/conectar una conexión | 5 segundos | Evitar esperas indefinidas al adquirir una conexión. |
| Conexión ociosa | 30 segundos | Liberar conexiones sin uso. |
| Sentencia SQL | 15 segundos | PostgreSQL cancela una sentencia que exceda el límite; no limita la duración total de una petición o transacción con varias sentencias. |

Una API y un Worker tienen un presupuesto conjunto de hasta diez conexiones, además de las que usan migraciones y herramientas operativas. Al escalar réplicas, sumar sus pools y contrastar el total con la capacidad real de PostgreSQL de Staging. Estos valores son límites de la implementación, no evidencia de dimensionamiento ni de pruebas de carga.

`backend/src/runtime.js` centraliza el procesamiento serial y la parada. El Worker procesa un correo a la vez y espera dos segundos después de finalizar cada ejecución, incluso si falla. El latido también es serial y espera diez segundos entre ejecuciones terminadas. Los errores de una tarea no acumulan nuevas ejecuciones en paralelo; el manejo de la cola conserva sus leases y reintentos PostgreSQL.

Al recibir SIGTERM/SIGINT:

1. La API deja de aceptar conexiones y espera el cierre del servidor HTTP; después desconecta Prisma.
2. El Worker cancela futuras iteraciones, espera el correo y el latido activos, cierra el transporte y desconecta Prisma.
3. Las señales repetidas comparten una sola parada. El cierre correcto termina con código 0; un fallo de limpieza o superar 25 segundos termina con código 1 y un mensaje genérico sin datos del cliente.

Configurar en el proveedor una ventana de terminación superior a 25 segundos y comprobarla en Staging; esta guía no acredita que ya esté configurada. Una terminación forzada puede interrumpir el envío: los leases permiten recuperar trabajos y la idempotencia de compra conserva las limitaciones documentadas de Resend. El drenaje no garantiza entrega exactamente una vez.

Para validar localmente las funciones de ejecución: `docker compose exec -T backend node --test src/runtime.test.js`. La evidencia y los pendientes de build, integraciones y recuperación real se registran en la fase 08 del [roadmap](../../ROADMAP.md), sin asumir que estas pruebas unitarias acrediten Railway.

## 3. Configurar worker

En el servicio `worker`, selecciona el mismo repositorio y configura:

- **Root Directory:** `/backend`
- **Dockerfile Path:** `Dockerfile.production`
- **Start Command:** `node src/worker.js`
- **Dominio público:** no.
- **Pre-deploy Command:** ninguno.

Variables necesarias:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{postgres.DATABASE_URL}}` |
| `FRONTEND_ORIGIN` | `https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}` |
| `EMAIL_TRANSPORT` | `resend` |
| `RESEND_API_KEY` | Clave Resend del entorno. |
| `RESEND_FROM` | Remitente en un dominio verificado en Resend, por ejemplo `Señor del Mictlán <pedidos@dominio-verificado>`. |
| `MAIL_FROM` | Remitente autorizado por Resend para mensajes de cuenta, por ejemplo `Señor del Mictlán <cuentas@dominio-verificado>`. |

### Plantilla Worker — Raw Editor

```env
NODE_ENV=production
RAILWAY_DOCKERFILE_PATH=Dockerfile.production
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
DATABASE_URL=${{postgres.DATABASE_URL}}
FRONTEND_ORIGIN=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
EMAIL_TRANSPORT=resend
RESEND_API_KEY=REEMPLAZAR_CLAVE_RESEND_STAGING
MAIL_FROM="Señor del Mictlán <REEMPLAZAR_REMITENTE_CUENTAS_VERIFICADO>"
RESEND_FROM="Señor del Mictlán <REEMPLAZAR_REMITENTE_COMPRAS_VERIFICADO>"
```

Reemplaza cada marcador de remitente por la dirección completa, por ejemplo `cuentas@tu-subdominio-verificado`, conservando el nombre, los signos `< >` y las comillas exteriores. No añadas `PORT`, Stripe ni secretos Turnstile al Worker.

En Railway, el código envía por la API HTTPS de Resend los correos de compra y los de cuenta (registro, confirmación y recuperación de contraseña). Así funciona también en los planes de Railway que bloquean conexiones SMTP salientes. Mailpit y SMTP sólo se usan en Compose para desarrollo local; no configures variables `SMTP_*` en Railway.

## 4. Configurar frontend

En `frontend`, selecciona el mismo repositorio y configura:

- **Root Directory:** `/frontend`; Railway construye desde esta carpeta.
- **Dockerfile Path:** `Dockerfile.production` mediante `RAILWAY_DOCKERFILE_PATH`.
- **Start Command:** `npm run start`
- **Healthcheck Path:** `/`
- **Pre-deploy Command:** ninguno.
- **Dominio público:** sí; Target Port `3000`.

Variables:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `INTERNAL_API_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` |
| `PORT` | `3000` |
| `MEDIA_BASE_URL` | URL HTTPS pública del bucket de medios de ese entorno. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Clave pública del widget Turnstile de staging. |

### Plantilla frontend — Raw Editor

```env
NODE_ENV=production
PORT=3000
RAILWAY_DOCKERFILE_PATH=Dockerfile.production
INTERNAL_API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
MEDIA_BASE_URL=REEMPLAZAR_ORIGEN_HTTPS_R2_STAGING
NEXT_PUBLIC_TURNSTILE_SITE_KEY=REEMPLAZAR_SITE_KEY_TURNSTILE_STAGING
```

No definas `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_PROXY_PATH`, `NEXT_ALLOWED_DEV_ORIGIN` ni valores LAN para este despliegue: producción usa el proxy del mismo origen automáticamente. Nunca pegues secretos de Stripe, Resend o Turnstile en frontend.

Declara ambas últimas variables en el servicio frontend antes del build. Railway debe hacerlas disponibles como argumentos Docker; el Dockerfile declara `ARG MEDIA_BASE_URL` y `ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY` y falla si falta uno. El secreto de Turnstile nunca debe pasar como argumento ni estar presente en el frontend.

`INTERNAL_API_URL` se usa en solicitudes del servidor Next.js y en el proxy `/api/backend/*`; debe apuntar a la red privada de Railway. El Dockerfile de producción envía las llamadas del navegador por ese proxy, bajo el mismo dominio del frontend. Así las cookies de sesión son propias del frontend y no dependen de cookies entre dominios. `NEXT_PUBLIC_API_URL` no se necesita con este proxy; el código sólo lo usa como origen directo alternativo en configuraciones que no usan el proxy. `MEDIA_BASE_URL` debe estar disponible al construir y ejecutar el frontend; `NEXT_PUBLIC_TURNSTILE_SITE_KEY` se incorpora al bundle durante el build. Son valores públicos, no secretos. Si cambian, vuelve a construir y desplegar el frontend.

Las cookies de sesión de producción usan `SameSite=Lax; Secure`. El proxy actual conserva `Origin` y la cookie HttpOnly. El límite de intentos del backend usa `request.ip`, pero el proxy de Next.js actual no reenvía `X-Real-IP`; por eso la guía no da por comprobada la identificación por IP de cada cliente detrás de Railway. Revísala durante la aceptación de staging antes de atribuirle ese efecto.

Configura `MEDIA_BASE_URL` del frontend y backend, más `STRIPE_MEDIA_BASE_URL` de la API, para que apunten a un bucket exclusivo de staging. No compartas objetos ni credenciales con producción. El bucket y hostname de producción se preparan por separado; para producción se requiere un dominio personalizado de R2, no la URL de desarrollo `r2.dev`.

## Turnstile de staging

El responsable del proyecto crea un widget Turnstile separado para staging y permite sólo el hostname público del frontend de staging. Configura la clave pública en `NEXT_PUBLIC_TURNSTILE_SITE_KEY` del servicio `frontend` y el secreto en `TURNSTILE_SECRET_KEY` del servicio `api`; no copies el secreto a frontend, worker, Compose ni al repositorio. La API toma el hostname esperado de `FRONTEND_ORIGIN` y verifica `success`, `hostname` y `action` (`account_register` o `account_login`) cuando las cookies son seguras.

Después de guardar variables, reconstruye y despliega `api` y `frontend`. Desde ambos formularios comprueba un token real válido, uno ausente y uno inválido; los casos ausente/inválido deben detenerse antes de crear cuenta o sesión. En este proyecto, reserva las claves de prueba de Cloudflare para automatización local: sus respuestas no contienen `action` y usan `example.com` como hostname, así que no acreditan el hostname ni la configuración real de staging. Consulta las instrucciones vigentes de [Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) y [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## 5. Configurar Stripe y validar staging

1. En el sandbox de Stripe, usa credenciales de prueba y crea un webhook que apunte a `https://<dominio-publico-api>/api/webhooks/stripe`.
2. Selecciona un destino snapshot del sandbox y suscríbelo a `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`, los cuatro eventos manejados por la aplicación y copia su secreto `whsec_…` a `STRIPE_WEBHOOK_SECRET` de staging. La [guía de Stripe](STRIPE.md) detalla la selección del destino, eventos y diferencia entre los secretos. No ejecutes `stripe listen` para un webhook ya publicado en Railway; Stripe llega directamente al dominio HTTPS.
3. Sigue el orden de la sección 1.4: PostgreSQL → API/migraciones → catálogo → Worker → frontend. El healthcheck de Railway valida el despliegue inicial y no sustituye monitoreo continuo.
4. Carga en staging el catálogo y las imágenes no productivas con los importes actuales del MVP. El SQL incluido abajo es para pruebas en una base de staging aislada; no es un seed de producción.
5. Prueba registro, confirmación de cuenta, recuperación de contraseña, inicio de sesión, imágenes del catálogo y carrito, compra aceptada, compra cancelada, webhook, limpieza del carrito, orden y PDF, entrega/reintento del worker y logs de errores.
6. Revisa los correos de cuenta y la confirmación de compra en Resend. La [guía de Resend](RESEND.md) explica la clave, remitentes y diagnóstico del worker.
7. Valida el widget de Turnstile que preparaste antes del build: tokens reales válidos, ausentes e inválidos en ambos formularios. Registra fecha, commit desplegado y resultado de cada recorrido; no cierres fase 08 con una compra aislada.

### Ejemplo reproducible de catálogo para staging

Este ejemplo crea en **staging aislado** las tres fichas y los importes vigentes del alcance MVP, después de aplicar migraciones y con Stripe en modo de prueba. Son los precios correctos para validar el MVP; el cliente debe aprobar los precios comerciales finales antes de vender en producción. El archivo <code>backend/prisma/dev-showcase.sql</code> sigue siendo exclusivo de una base local vacía; este bloque de staging es independiente y no debe ejecutarse en producción.

1. Instala Railway CLI y `psql`; ejecuta `railway login` y `railway link` desde la raíz del proyecto, y selecciona el proyecto correcto. Conecta la base del entorno de prueba con `railway connect postgres --environment Staging` (sustituye `postgres` y `Staging` si tus nombres son distintos). La [CLI de Railway](https://docs.railway.com/cli/connect) puede usar un túnel SSH cuando la base no tiene proxy público.
2. Antes de ejecutar el bloque, confirma en Railway que la conexión corresponde a **Staging**, que Stripe usa claves de prueba y que las imágenes están cargadas en el bucket no productivo con las claves del [inventario R2](R2.md). En el prompt de `psql`, pega:

```sql
INSERT INTO products (
  id, slug, name, description, price_cents, image_key, image_alt,
  lifestyle_image_key, label_one, label_two, sensory_profile,
  alcohol_min_percent, alcohol_max_percent, volume_ml, position, active, updated_at
) VALUES
  (
    gen_random_uuid(), 'calios', 'Calios · Destilado de pulque',
    'Un destilado de pulque de perfil frutal y terroso.', 25000,
    'images/catalog/calios-product.png', 'Botella de Calios, destilado de pulque',
    'images/catalog/calios-lifestyle.png', 'Pulque fermentado', 'Frutal y terroso',
    'Notas frutales y dulces únicas, con un retrogusto terroso que evoca las antiguas haciendas pulqueras.',
    36, 42, 750, 1, true, now()
  ),
  (
    gen_random_uuid(), 'mezcal-joven', 'Mezcal joven · Doble destilación',
    'Elaborado con cupreata silvestre, de notas herbales y ahumadas.', 35000,
    'images/catalog/mezcal-joven-product.png', 'Botella de mezcal joven Señor del Mictlán',
    'images/catalog/mezcal-joven-lifestyle.png', 'Cupreata silvestre', 'Herbal y ahumado',
    'Aromas frescos a hierba y tierra húmeda. Entrada potente en boca con un ahumado auténtico y persistente.',
    45, 45, 750, 2, true, now()
  ),
  (
    gen_random_uuid(), 'mezcal-doble-destilacion', 'Mezcal reposado · Doble destilación',
    'Elaborado con cupreata silvestre, con notas de quiote y madera.', 50000,
    'images/catalog/mezcal-reposado-product.png', 'Botella de mezcal de doble destilación Señor del Mictlán',
    'images/catalog/mezcal-reposado-lifestyle.png', 'Cupreata silvestre', 'Quiote y madera',
    'Notas dulces de quiote y madera con un final ahumado elegante. Cuerpo robusto y matices dorados brillantes.',
    40, 40, 750, 3, true, now()
  )
ON CONFLICT (slug) DO NOTHING;
```

3. Sal de `psql` con `\q` y abre `https://<dominio-publico-api>/api/catalog/products`: deben aparecer las fichas activas. `ON CONFLICT (slug) DO NOTHING` evita reemplazar fichas existentes; si ya existen, revisa sus valores en lugar de asumir que este bloque los actualizó.

### Diagnóstico de problemas observados

| Síntoma | Qué revisar |
|---|---|
| La landing abre pero la colección no | Comprueba que `GET /api/catalog/products` devuelva fichas, que las migraciones y datos de staging estén cargados y que `INTERNAL_API_URL` apunte a la API privada y al puerto donde realmente escucha. |
| No aparece la marca o faltan imágenes | Revisa las claves en R2 y `MEDIA_BASE_URL` en API y frontend; el frontend debe reconstruirse si cambió la variable usada en build. |
| La contraseña es aceptada pero la sesión no se conserva | Revisa que el frontend use `Dockerfile.production`, el proxy `/api/backend/*`, `INTERNAL_API_URL`, `FRONTEND_ORIGIN` y HTTPS. Prueba también desde el teléfono. |
| La compra se pagó pero no llegó el correo | Comprueba la entrega del webhook, el trabajo de correo y los logs del worker. Un fallo al generar el PDF o un rechazo de Resend impide el envío aunque Stripe haya confirmado el pago. |
| El carrito conserva artículos pagados | Comprueba webhook, sesión y refresco del carrito. Las líneas que cambiaron mientras el Checkout estaba abierto se preservan deliberadamente. |

### Control del consumo del workspace

Railway ofrece límites para el consumo de **cómputo a nivel de workspace**, no un máximo independiente por servicio o entorno:

1. Abre la página **Usage** del workspace y revisa el consumo por proyecto y los límites actuales. También puedes consultar el estado con <code>railway usage limit status</code>.
2. Define primero el presupuesto mensual aprobado para el workspace. Configura la alerta por correo sin interrumpir servicios. Un límite duro de cómputo apaga todos los workloads del workspace al alcanzarse; si Staging y Production están en el mismo workspace, ambos quedan afectados. Railway lo describe como una acción potencialmente destructiva.
3. No copies umbrales de ejemplo ni fijes cifras sin presupuesto aprobado. La configuración se gestiona desde **Workspace Usage**; la CLI puede consultarla y establecer valores aprobados con <code>railway usage limit set --target workspace --soft &lt;dólares&gt; --hard &lt;dólares&gt;</code>. Verifica las reglas de entrada en la [referencia CLI](https://docs.railway.com/cli/usage).
4. Registra en el acta de despliegue quién eligió esos umbrales y el efecto esperado. No cambies valores existentes sin presupuesto aprobado.


[Control de costos de Railway](https://docs.railway.com/pricing/cost-control).

## 6. Promover a producción

Prepara `Production` sólo después de aceptar staging. Mantén deshabilitado el inicio de Checkout con `CHECKOUT_ENABLED=false` (o sin definir) y `STRIPE_MODE=test` hasta recibir autorización explícita. Usa sólo claves `sk_test_…` durante la preparación y no registres un webhook live. No habilites `CHECKOUT_ENABLED=true`, claves `sk_live_…` ni pagos reales antes de esa autorización.

- PostgreSQL independiente, migraciones revisadas y copias de seguridad/restauración comprobadas.
- Dominios definitivos con TLS, `FRONTEND_ORIGIN`, URLs de API y URLs de medios de producción correctas.
- Claves y webhook de Stripe live quedan pendientes de autorización explícita; cuando se autoricen, serán distintos a los de Staging.
- Dominio remitente verificado y clave de Resend para los dos tipos de correo. El worker desplegado usa la API HTTPS de Resend; SMTP/Mailpit es el flujo local.
- Catálogo y medios de producción separados de los datos de staging, con precios comerciales finales aprobados por el cliente. Los importes actuales del MVP son para pruebas y no autorizan ventas reales.
- Revisión de logs de API y worker, estado de `/health` y procedimiento para volver al despliegue anterior.

Haz un primer pago real sólo después de autorizar explícitamente la salida a producción. Para deshacer una versión de aplicación, vuelve al despliegue anterior de API/frontend/worker compatible con el esquema actual. No reviertas una migración destructiva ni restaures una base sin revisar el impacto de datos.

### Verificación inicial de memoria

Durante Staging, registra en Railway la memoria de cada servicio desde el arranque hasta que se estabilice y mientras atiende recorridos representativos. Prioriza el frontend por la observación cercana a 500 MB que motiva esta revisión. Para averiguar cuándo aumenta, ejecuta recorridos controlados por separado y anota el commit, servicio, intervalo, ruta o acción ejercitada, tráfico y memoria máxima y sostenida; distingue el pico de arranque del crecimiento asociado a una carga. La gráfica del servicio permite observar la correlación temporal, pero por sí sola no identifica una ruta ni una asignación de memoria como causa.

Compara la observación cercana a 500 MB sólo si coinciden el modo de ejecución y una carga comparable; no la trates como un umbral confirmado. Si la gráfica no permite explicar un crecimiento reproducible, perfila el frontend con un build de producción y una secuencia de solicitudes equivalente antes de cambiar código o configuración. No cambies límites de memoria ni configuración de Node.js por una medición aislada. Registra las observaciones de Staging como evidencia para investigar; después del primer despliegue en producción repite la medición y establece una línea base propia, porque la carga real puede ser distinta.

### Respaldos y recuperación

En el servicio PostgreSQL abre **Backups** y configura una programación de acuerdo con la pérdida de datos aceptable. Un respaldo de volumen se restaura en el mismo proyecto y entorno. Para verificar recuperación sin sustituir la base activa, prepara también un volcado lógico y restáuralo en una base de prueba; registra la fecha y el resultado. Consulta las guías de [respaldos de volumen](https://docs.railway.com/volumes/backups) y [respaldo y restauración de PostgreSQL](https://docs.railway.com/guides/postgres-backups-restores).

## Referencias

- [Dockerfiles y argumentos de build en Railway](https://docs.railway.com/builds/dockerfiles)
- [Monorepos y directorios raíz en Railway](https://docs.railway.com/deployments/monorepo)
- [Red privada y dominios públicos/privados](https://docs.railway.com/networking/domains/working-with-domains)
- [Comandos pre-deploy](https://docs.railway.com/deployments/pre-deploy-command)
- [Healthchecks en Railway](https://docs.railway.com/deployments/healthchecks)
- [Límites de consumo Railway CLI](https://docs.railway.com/cli/usage)
- [Variables de entorno de Next.js](https://nextjs.org/docs/app/guides/environment-variables)
- [Prisma migrate deploy](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)
- [Importar servicios Docker Compose en Railway](https://docs.railway.com/guides/docker-compose)
- [Webhooks firmados de Stripe](https://docs.stripe.com/webhooks)
- [Validación server-side de Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
