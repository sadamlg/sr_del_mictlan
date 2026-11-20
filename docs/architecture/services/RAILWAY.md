# Despliegue en Railway: staging y producción

Esta guía explica cómo crear los cuatro servicios, configurar sus conexiones y desplegarlos en orden. Usa Staging como referencia real; Producción requiere recursos, dominios y credenciales propios.

Crear servicios, conectar el repositorio, configurar variables, añadir dominios o desplegar son cambios externos y requieren autorización explícita antes de aplicarse. Revisa el comportamiento de autodespliegue al conectar la rama: un push posterior puede iniciar un despliegue sin otra acción manual. En Railway inspecciona y aprueba la vista de cambios staged sólo después de la autorización correspondiente.

Antes de configurar staging, completa el [entorno local](../docker/COMPOSE.md) y prueba [Stripe en local](STRIPE.md). Usa la guía de [Cloudflare R2](R2.md) para crear un bucket dedicado de staging, separado del bucket local y de producción. La cuenta, dominio, remitentes, límites y envío real de Resend se revisan en staging siguiendo [Resend](RESEND.md); no configures Resend en Compose. No necesitas cambiar los *nameservers* para usar dominios públicos de Railway en staging.

## Por qué existen Dockerfiles de producción

Los Dockerfiles normales y Compose ejecutan servidores de desarrollo con observación de cambios. `frontend/Dockerfile.production` construye Next.js con `npm run build` y arranca `next start`; `backend/Dockerfile.production` instala Prisma CLI, genera Prisma Client y arranca la API. El worker comparte la imagen del backend, pero usa `node src/worker.js` como comando de inicio. Las imágenes de este proyecto usan Node.js `24.21.0-bookworm-slim` y ejecutan como usuario `node`. Railway debe usar `Dockerfile.production` mediante `RAILWAY_DOCKERFILE_PATH`; los argumentos Docker `MEDIA_BASE_URL` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY` se requieren al construir el frontend. El primero configura la lista de imágenes remotas y el segundo se incorpora al bundle público, así que el frontend se reconstruye cuando cambien. [Dockerfiles de Railway](https://docs.railway.com/builds/dockerfiles), [variables de entorno de Next.js](https://nextjs.org/docs/app/guides/environment-variables).

## Servicios

Railway puede importar servicios compatibles desde un archivo Compose, pero no todas las opciones de Compose tienen equivalente en la plataforma. Para este proyecto configura y revisa estos servicios en el lienzo de Railway; no copies los puertos publicados ni los bind mounts de desarrollo.

| Servicio Railway | Código / recurso | Exposición | Dockerfile |
|---|---|---|---|
| `postgres` | PostgreSQL de Railway con volumen | Sólo red privada | Plantilla PostgreSQL; respaldos se configuran por separado |
| `Backend` | `backend/` | Dominio público HTTPS para recibir webhooks de Stripe; las llamadas de `Frontend` usan la red privada | `backend/Dockerfile.production` |
| `worker` | `backend/` | Sólo red privada | `backend/Dockerfile.production` |
| `Frontend` | `frontend/` | Dominio público | `frontend/Dockerfile.production` |

No despliegues Mailpit en Railway: es sólo para desarrollo local.

`Backend` tiene un dominio público porque Stripe debe poder enviar eventos a una URL HTTPS pública. El dominio privado `backend.railway.internal` sólo resuelve entre servicios del mismo entorno Railway, así que sirve para las llamadas de `Frontend`, no para Stripe. En Staging, `Frontend` usa `INTERNAL_API_URL=http://${{Backend.RAILWAY_PRIVATE_DOMAIN}}:${{Backend.PORT}}` y su proxy `/api/backend/*`; no necesita llamar al dominio público de la API. El destino de Stripe es `https://backend-staging-c2e45865.up.railway.app/api/webhooks/stripe`. [Red privada de Railway](https://docs.railway.com/networking/private-networking/how-it-works) · [URL pública requerida por Stripe](https://docs.stripe.com/webhooks#setup-your-endpoint).

El dominio público hace alcanzables las rutas HTTP de Backend, no sólo el webhook. La API comprueba `Origin` en solicitudes de navegador, pero esa comprobación no autentica clientes que llamen directamente. Mantén las rutas protegidas por sesión/autorización y límites correspondientes; el webhook valida `Stripe-Signature` con `STRIPE_WEBHOOK_SECRET`. La base de datos permanece privada.

### Configuración de referencia de Staging

Los servicios `postgres`, `Backend`, `worker` y `Frontend` usan **US West Metal (California; `us-west2`)**, una réplica por servicio. Mantén PostgreSQL, Backend y Worker en la misma región para evitar latencia entre regiones. Elige la región antes de inicializar el volumen: mover una base existente requiere una ventana de mantenimiento y respaldo previo. La cercanía geográfica a México no garantiza la menor latencia desde todas las redes.

Frontend público: `https://frontend-staging-f50c4d1d.up.railway.app`. Backend público: `https://backend-staging-c2e45865.up.railway.app`. Las plantillas conservan referencias dinámicas al nombre exacto de cada servicio; Backend y Worker usan el mismo `FRONTEND_ORIGIN`.

Las siguientes secciones dan el orden de configuración, las plantillas por servicio y cómo corregir fallos frecuentes.

### Valores actuales de PostgreSQL

Railway genera las variables de conexión y las contraseñas al crear el servicio. Conserva esos valores; no los copies entre entornos ni al repositorio. Los valores no secretos del servicio `postgres` de Staging son:

| Variable | Valor |
|---|---|
| `PGDATA` | `/var/lib/postgresql/data/pgdata` |
| `PGDATABASE` y `POSTGRES_DB` | `railway` |
| `PGHOST` y `RAILWAY_PRIVATE_DOMAIN` | `postgres.railway.internal` |
| `PGPORT` | `5432` |
| `PGUSER` y `POSTGRES_USER` | `postgres` |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `60` |
| `SSL_CERT_DAYS` | `820` |

`DATABASE_URL`, `PGPASSWORD` y `POSTGRES_PASSWORD` contienen credenciales generadas; la aplicación construye su DSN con referencias de Railway y no necesita que copies ni reveles esos valores.

## 1. Preparar Staging y seguir el orden de arranque

En este Staging, los nombres de servicio son `postgres`, `Backend`, `worker` y `Frontend`. Las referencias `${{servicio.VARIABLE}}` deben usar el nombre exacto, incluida la capitalización. Por eso las plantillas de esta guía usan `${{Backend.RAILWAY_PRIVATE_DOMAIN}}`, `${{Frontend.RAILWAY_PUBLIC_DOMAIN}}` y `${{postgres.DATABASE_URL}}`. No es obligatorio renombrar `Backend` como `api`: es el nombre visible del servicio que ejecuta la API. Al crear otro entorno puedes elegir otros nombres, pero debes adaptar todas sus referencias. Selecciona **Staging** antes de cada operación. Production se prepara después, según la sección 6; no dupliques todavía secretos ni recursos productivos.

### 1.1 Preparar código y servicios sin iniciar la aplicación

1. Comprueba que la rama elegida en GitHub contiene los Dockerfiles de producción, migraciones y cambios que se van a desplegar. Railway no recibe los cambios locales sin publicar. Anota el commit objetivo y comprueba CI y build antes de continuar.
2. Crea el proyecto y el entorno Staging. Añade PostgreSQL desde la plantilla, renombra el servicio a `postgres` y conserva su volumen y variables generadas. **Antes de desplegarlo**, abre Settings → Scale → Regions y selecciona `US West (California, USA)` (ID `us-west2`) con una réplica. Verifica región y réplicas antes de continuar. Espera a que esté activo. No pegues credenciales locales ni reemplaces las contraseñas que genera Railway.
3. Crea los servicios vacíos `Backend`, `worker` y `Frontend`. En Settings → Scale → Regions coloca cada uno en la misma región `US West (California, USA; us-west2)` y deja una réplica para el primer levantamiento. Configura repositorio, rama, Root Directory y Dockerfile según las secciones 2–4 antes de desplegar. Si conectar el repositorio dispara un intento automático incompleto, no lo uses como evidencia de fallo de la aplicación: completa configuración y vuelve a desplegar. Revisa los cambios pendientes antes de aplicarlos. Railway describe esta ubicación y el ajuste de réplicas en [Regions](https://docs.railway.com/deployments/regions) y [Optimize Performance](https://docs.railway.com/deployments/optimize-performance).
4. En Networking genera un dominio público para API y frontend, con **Target Port 3000**. Las plantillas fijan `PORT=3000` en ambos. Si el panel todavía no ofrece generar un dominio, completa el arranque inicial descrito abajo antes de configurar las referencias que dependen de él.
5. Anota los dos dominios. Antes de desplegar API, comprueba que el hostname de frontend ya existe y que `FRONTEND_ORIGIN` se resuelve como una URL completa (`https://<hostname>`), no como `https://`. El servicio, su dominio y la referencia deben pertenecer al mismo entorno Staging.

**Si el panel exige un primer despliegue para asignar dominios:** inicia API con el origen temporal sintácticamente válido `https://bootstrap.invalid`, `CHECKOUT_ENABLED=false` y sin permitir usuarios. El hostname reservado `.invalid` sólo sirve para que la API arranque; no es un dominio operativo ni permite completar login o Turnstile. Tras generar el dominio de `Frontend`, sustituye el origen temporal por `https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}`, verifica que la referencia tenga hostname y despliega de nuevo API. Configura Frontend con su URL privada y las variables públicas de medios y Turnstile. Ese primer Frontend permite obtener su dominio, pero todavía no acredita login, correo ni catálogo. Autoriza ese hostname en Turnstile y configura Worker. Vuelve al orden 1.4 para las comprobaciones y reconstruye Frontend después de cargar el catálogo. No conserves el origen temporal ni uses esta fase de arranque para probar compras.

La red privada sólo conecta servicios del mismo proyecto y entorno. Esta aplicación escucha en IPv4 (`0.0.0.0`): usa un entorno nuevo con red privada IPv4/IPv6. Si reutilizas uno antiguo sólo IPv6, verifica su compatibilidad antes de desplegar; un dominio privado por sí solo no demuestra conectividad. [Red privada de Railway](https://docs.railway.com/networking/private-networking/how-it-works).

### 1.2 Preparar proveedores antes de pegar variables

| Preparación | Acción y resultado que debes tener |
|---|---|
| R2 | Crea un bucket exclusivo de Staging y carga manualmente todos los archivos del [inventario R2](R2.md#inventario-de-medios), con las carpetas y claves exactas. Habilita una URL pública HTTPS y abre una imagen concreta del hero y una de catálogo. Copia sólo el origen, sin `/images`, query ni barra final. `r2.dev` sirve para pruebas limitadas; producción requiere dominio personalizado. La app sólo lee medios públicos: no necesita tokens R2 ni credenciales S3 en Railway. |
| Resend | Sigue [Resend](RESEND.md) para verificar el dominio/subdominio de envío y sus registros en el DNS autoritativo, conservando MX y registros existentes. Prepara dos remitentes autorizados (`MAIL_FROM` y `RESEND_FROM`) y una clave exclusiva de Staging con permiso de envío, restringida al dominio cuando sea posible. Sólo el Worker recibe esa clave. Verifica cuotas y usa destinatarios de prueba autorizados. |
| Turnstile | Crea el widget de Staging y autoriza el hostname del frontend, sin protocolo ni ruta. Obtén site key y secret key; la primera va en frontend, la segunda sólo en API. Consulta [Turnstile de staging](#turnstile-de-staging). |
| Stripe test | Obtén `sk_test_…` del sandbox. Crea el destino HTTPS en `https://<dominio-api>/api/webhooks/stripe` para los cuatro eventos de la sección 5 y copia su `whsec_…`. Puede registrarse antes de que la API esté activa; comprueba las entregas después. No reutilices el secreto de `stripe listen`. |

### 1.3 Pegar las plantillas del Raw Editor

En **cada servicio → Variables → Raw Editor**, pega su bloque completo. Usa formato `.env`, una línea `CLAVE=VALOR`, y conserva literalmente `${{…}}`, la sintaxis de referencias de Railway. Los valores públicos de Staging reflejan la configuración actual. Sustituye los valores con `EJEMPLO_NO_VALIDO` por secretos propios: son ejemplos ficticios y no permiten desplegar. Conserva las comillas de los remitentes. No pegues variables de distintos servicios en un bloque compartido.

No despliegues una plantilla parcial. Antes de pulsar **Update Variables**, confirma que no quede ningún valor `EJEMPLO_NO_VALIDO` y que los nombres, el modo y las referencias estén completos. No compartas capturas del Raw Editor con claves o secretos legibles.

Guardar o actualizar variables puede dejar cambios staged. Si aparece **Apply changes / Apply N changes**, abre **Details**, revisa el conjunto y aplícalo antes de desplegar. Si una referencia aparece como `<empty string>`, comprueba el nombre exacto del servicio y de la variable fuente; las comillas no generan una referencia faltante.

Para el primer arranque con dominio de frontend pendiente, no pegues todavía la referencia final de `FRONTEND_ORIGIN`: usa el valor temporal indicado en 1.1 sólo en API. Cuando el dominio exista, guarda y aplica la referencia final antes de probar registro, login o Turnstile.

Las opciones Root Directory, Start Command, Pre-deploy y Healthcheck se configuran en Settings; pegarlas como variables no las configura. `RAILWAY_DOCKERFILE_PATH` y `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` sí son variables de Railway. Consulta [Raw Editor y referencias](https://docs.railway.com/variables) y [variables de plataforma](https://docs.railway.com/variables/reference).

### 1.4 Desplegar por dependencias

Configura primero las tres aplicaciones con las secciones 2–4. Luego ejecuta este orden; no avances si falla la comprobación de una etapa:

| Orden | Acción | Comprobación antes de continuar |
|---|---|---|
| 1 | PostgreSQL activo | Volumen presente y variables generadas `PGUSER`, `POSTGRES_PASSWORD`, `PGDATABASE` y `RAILWAY_PRIVATE_DOMAIN` disponibles en el servicio. |
| 2 | Desplegar API | En logs, Prisma identifica el host privado PostgreSQL y termina las migraciones. Luego la API arranca, `/health` devuelve 200 con `database=connected`, `/api/cart/account` sin sesión devuelve 401 (no 404) y `/api/public-config` muestra `checkoutEnabled: true` en Staging test. Si las migraciones pasan y la API cae con `Invalid URL`, revisa `FRONTEND_ORIGIN`; no repitas ni ejecutes manualmente la migración por ese error. |
| 3 | Cargar catálogo SQL de la sección 5 | `/api/catalog/products` devuelve tres fichas y sus imágenes HTTPS correctas. Hazlo antes de desplegar frontend: el catálogo exitoso se cachea y podría quedar vacío si construyes/abres antes de cargar datos. |
| 4 | Desplegar Worker | Log de conexión a PostgreSQL; sin errores de remitentes o credencial. No configurar healthcheck HTTP en un proceso sin servidor web. |
| 5 | Construir y desplegar frontend | `/` carga por HTTPS, muestra catálogo y medios, y `/api/backend/public-config` devuelve el estado de API a través de la red privada. |
Si se cambia el origen R2 o la site key, reconstruye frontend. Si se cambia un secreto de API/Worker, vuelve a desplegar el servicio correspondiente. Conserva una réplica inicial hasta validar las dependencias y el presupuesto de conexiones.

## 2. Configurar API

En el servicio `Backend` (la API), selecciona el repositorio y configura:

- **Root Directory:** `/backend`; Railway construye desde esta carpeta.
- **Dockerfile Path:** `Dockerfile.production` mediante la variable de servicio `RAILWAY_DOCKERFILE_PATH`.
- **Start Command:** `node src/server.js`
- **Healthcheck Path:** `/health`
- **Pre-deploy Command:** `npm run prisma:migrate:deploy`
- **Dominio público:** sí; Stripe necesita alcanzar el webhook. En el Dockerfile de producción, las peticiones del navegador pasan por el proxy del frontend hacia la API privada.

El pre-deploy ejecuta las migraciones existentes antes de arrancar la API. El Dockerfile instala Prisma CLI para que ese comando esté disponible. No pongas la migración también en `worker`: se ejecuta una vez en `Backend` para evitar que ambos procesos compitan al iniciar.

El bloque incluye los valores vigentes de Staging y sus referencias a PostgreSQL y Frontend. `CHECKOUT_ENABLED=true` y `STRIPE_MODE=test` habilitan las pruebas de compra; en Producción el Checkout permanece deshabilitado hasta la autorización de salida. La API refleja el estado en `/api/public-config`; cuando está deshabilitado, la tienda desactiva agregar al carrito y muestra “Próximamente”.

### Plantilla API — Raw Editor

```env
NODE_ENV=production
PORT=3000
RAILWAY_DOCKERFILE_PATH=Dockerfile.production
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
DATABASE_URL=postgresql://${{postgres.PGUSER}}:${{postgres.POSTGRES_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
FRONTEND_ORIGIN=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
MEDIA_BASE_URL=https://pub-47df7d3a7dd94d268c1661b2c36e0ae5.r2.dev
STRIPE_MEDIA_BASE_URL=https://pub-47df7d3a7dd94d268c1661b2c36e0ae5.r2.dev
CHECKOUT_ENABLED=true
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_EJEMPLO_NO_VALIDO
STRIPE_WEBHOOK_SECRET=whsec_EJEMPLO_NO_VALIDO
TURNSTILE_SECRET_KEY=0x4AAAAAEJEMPLO_NO_VALIDO
```

Ambas URL de medios deben coincidir. La API no necesita clave de Resend, site key pública de Turnstile ni credenciales de escritura R2.

### Cómo se construye `DATABASE_URL`

`DATABASE_URL` es el DSN completo que Prisma necesita: esquema `postgresql://`, usuario, contraseña, host privado, puerto y base. Por eso la plantilla arma la URL con las variables generadas por `postgres`; Railway sustituye cada referencia al iniciar el servicio. La alternativa corta `${{postgres.DATABASE_URL}}` copia el DSN que publica la plantilla PostgreSQL, pero sólo funciona si esa variable existe y resuelve correctamente. Mantén la fórmula explícita de la plantilla en Backend y Worker y nunca copies el DSN expandido: contiene credenciales.

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

Las funciones de ejecución se pueden validar localmente con `docker compose exec -T backend node --test src/runtime.test.js`; esa prueba no sustituye la aceptación desplegada.

## 3. Configurar worker

En el servicio `worker`, selecciona el mismo repositorio y configura:

- **Root Directory:** `/backend`
- **Dockerfile Path:** `Dockerfile.production`
- **Start Command:** `node src/worker.js`
- **Dominio público:** no.
- **Pre-deploy Command:** ninguno.

El bloque contiene la configuración vigente de Worker. La clave de Resend se guarda sólo aquí; Backend no envía correo.

### Plantilla Worker — Raw Editor

```env
NODE_ENV=production
RAILWAY_DOCKERFILE_PATH=Dockerfile.production
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
DATABASE_URL=postgresql://${{postgres.PGUSER}}:${{postgres.POSTGRES_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{postgres.PGDATABASE}}
FRONTEND_ORIGIN=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
EMAIL_TRANSPORT=resend
RESEND_API_KEY=re_EJEMPLO_NO_VALIDO
MAIL_FROM="Señor del Mictlán <cuentas@mail.srmictlan.com>"
RESEND_FROM="Señor del Mictlán <pedidos@mail.srmictlan.com>"
```

`MAIL_FROM` envía confirmación, recuperación y cambios de cuenta; `RESEND_FROM` envía confirmaciones de compra con PDF. Cada valor debe conservar el formato `Nombre visible <dirección@dominio-verificado>` y las comillas exteriores del Raw Editor. Estas direcciones identifican al remitente; no crean buzones para recibir respuestas. El subdominio `mail.srmictlan.com` es el dominio de envío documentado en [Resend](RESEND.md). No añadas `PORT`, Stripe ni secretos Turnstile al Worker.

En Railway, el código envía por la API HTTPS de Resend los correos de compra y los de cuenta (registro, confirmación y recuperación de contraseña). Así funciona también en los planes de Railway que bloquean conexiones SMTP salientes. Mailpit y SMTP sólo se usan en Compose para desarrollo local; no configures variables `SMTP_*` en Railway.

## 4. Configurar frontend

En `Frontend`, selecciona el mismo repositorio y configura:

- **Root Directory:** `/frontend`; Railway construye desde esta carpeta.
- **Dockerfile Path:** `Dockerfile.production` mediante `RAILWAY_DOCKERFILE_PATH`.
- **Start Command:** `npm run start`
- **Healthcheck Path:** `/`
- **Pre-deploy Command:** ninguno.
- **Dominio público:** sí; Target Port `3000`.

El bloque contiene la configuración vigente de Frontend. `INTERNAL_API_URL` resuelve a `http://backend.railway.internal:3000`; medios y site key son valores públicos incorporados al build.

### Plantilla frontend — Raw Editor

```env
NODE_ENV=production
PORT=3000
RAILWAY_DOCKERFILE_PATH=Dockerfile.production
INTERNAL_API_URL=http://${{Backend.RAILWAY_PRIVATE_DOMAIN}}:${{Backend.PORT}}
MEDIA_BASE_URL=https://pub-47df7d3a7dd94d268c1661b2c36e0ae5.r2.dev
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAF8VZwuGYRWxvFOn
ROBOTS_INDEXABLE=false
```

No definas `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_PROXY_PATH`, `NEXT_ALLOWED_DEV_ORIGIN` ni valores LAN para este despliegue: producción usa el proxy del mismo origen automáticamente. Nunca pegues secretos de Stripe, Resend o Turnstile en frontend.

Define `MEDIA_BASE_URL` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY` antes del build: el Dockerfile las exige como argumentos Docker.

`ROBOTS_INDEXABLE` es una variable de runtime: mantenla en `false` en Staging para enviar `X-Robots-Tag: noindex, nofollow`. Sólo la landing puede indexarse si se establece en `true` para Producción tras aprobar la indexación del dominio público; las rutas de cuenta y cualquier otra ruta conservan `noindex`.

`INTERNAL_API_URL` se usa en solicitudes del servidor Next.js y en el proxy `/api/backend/*`; debe apuntar a la red privada de Railway. El Dockerfile de producción envía las llamadas del navegador por ese proxy, bajo el mismo dominio del frontend. Así las cookies de sesión son propias del frontend y no dependen de cookies entre dominios. `NEXT_PUBLIC_API_URL` no se necesita con este proxy; el código sólo lo usa como origen directo alternativo en configuraciones que no usan el proxy. `MEDIA_BASE_URL` debe estar disponible al construir y ejecutar el frontend; `NEXT_PUBLIC_TURNSTILE_SITE_KEY` se incorpora al bundle durante el build. Son valores públicos, no secretos. Si cambian, vuelve a construir y desplegar el frontend.

Las cookies de sesión de producción usan `SameSite=Lax; Secure`. El proxy actual conserva `Origin` y la cookie HttpOnly. El límite de intentos del backend usa `request.ip`, pero el proxy de Next.js actual no reenvía `X-Real-IP`; por eso la guía no da por comprobada la identificación por IP de cada cliente detrás de Railway. Revísala durante la aceptación de staging antes de atribuirle ese efecto.

Configura `MEDIA_BASE_URL` del frontend y backend, más `STRIPE_MEDIA_BASE_URL` de la API, para que apunten a un bucket exclusivo de staging. No compartas objetos ni credenciales con producción. El bucket y hostname de producción se preparan por separado; para producción se requiere un dominio personalizado de R2, no la URL de desarrollo `r2.dev`.

## Turnstile de staging

El responsable del proyecto crea un widget Turnstile separado para staging y permite sólo el hostname público de `Frontend` de staging. Configura la clave pública en `NEXT_PUBLIC_TURNSTILE_SITE_KEY` del servicio `Frontend` y el secreto en `TURNSTILE_SECRET_KEY` del servicio `Backend`; no copies el secreto a Frontend, Worker, Compose ni al repositorio. La API toma el hostname esperado de `FRONTEND_ORIGIN` y verifica `success`, `hostname` y `action` (`account_register` o `account_login`) cuando las cookies son seguras.

Después de guardar variables, reconstruye y despliega `Backend` y `Frontend`. Desde ambos formularios comprueba un token real válido, uno ausente y uno inválido; los casos ausente/inválido deben detenerse antes de crear cuenta o sesión. Tras un registro válido, confirma que llega el correo de cuenta. Las claves de prueba de Cloudflare son para automatización local: no validan el hostname real de Staging. Consulta [Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) y [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## 5. Preparar catálogo e integraciones de Staging

### Configurar Stripe

1. En el sandbox de Stripe, crea un webhook para `https://<dominio-publico-api>/api/webhooks/stripe`.
2. Suscríbelo a `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`. Guarda su secreto `whsec_…` en `STRIPE_WEBHOOK_SECRET` de Staging. La [guía de Stripe](STRIPE.md) explica el destino y los secretos; no uses `stripe listen` para el webhook publicado.
3. Con `CHECKOUT_ENABLED=true` y Stripe en modo `test`, prueba una compra aceptada y otra cancelada. Confirma que sólo el webhook firmado marca el pedido como pagado, limpia las líneas compradas y conserva los cambios concurrentes del carrito.
4. Si un pago quedó pendiente por un destino antiguo, corrige la URL del destino existente en Stripe y reenvía su evento `checkout.session.completed` desde **Event deliveries → Resend**. Comprueba una respuesta 2xx y que aparezca el pedido; reenviar el evento no crea otro cobro. Si cambiaste de destino, configura su secreto propio antes de reenviar.
5. Comprueba que el Worker entregue por Resend el correo de compra con PDF. Para configurar el envío, consulta [Resend](RESEND.md).

### Diagnosticar y corregir consumo de memoria

Frontend ejecuta `next start` en producción (Next.js 16.4.6, Node.js 24.21.0); el build ocurre antes y no comparte el proceso de runtime. Su configuración activa `cacheComponents` y `partialPrefetching`. `next/image` permite el origen definido por `MEDIA_BASE_URL` y se optimiza en Staging porque el origen R2 usa HTTPS; sólo se omite esa optimización en desarrollo para medios HTTP de localhost o de una IPv4 privada. La optimización transforma imágenes solicitadas y puede explicar actividad asociada a solicitudes de imágenes, pero por sí sola no demuestra el origen de un consumo alto en reposo. El Dockerfile instala dependencias de desarrollo para compilar y arranca `next start`; reducir el tamaño de la imagen no prueba que baje la memoria de runtime.

Para separar heap, resto del proceso y contenedor, usa estas métricas técnicas. Sus valores se solapan: **no sumes** `heapUsed`, `external`, `arrayBuffers` y RSS como si fueran partes independientes.

| Capa | Métricas | Qué permite distinguir |
|---|---|---|
| V8 / JavaScript | `heapUsed`, `heapTotal`, `heap_size_limit`, `malloced_memory`, `external_memory`, `number_of_native_contexts`, `number_of_detached_contexts` | Heap ocupado y reservado, asignaciones de V8 y contextos. Un heap que sigue creciendo en reposo es una pista de objetos retenidos, no prueba suficiente de fuga. |
| Proceso Node | `rss`, `external`, `arrayBuffers`, `uptime`, `pid` | RSS incluye heap residente y otras páginas del proceso. `arrayBuffers` ya forma parte de `external`; el resto de RSS puede incluir memoria nativa, bibliotecas, stacks, páginas mapeadas y fragmentación del allocator. RSS menos heap no identifica una causa concreta. |
| Contenedor (cgroup v2) | `memory.current`, `memory.max`, `memory.stat: anon`, `file`, `kernel` | Total y límite contabilizados por el contenedor, más memoria anónima, caché/archivos y kernel. Puede incluir procesos auxiliares y no equivale al RSS de Node; la diferencia tampoco señala por sí sola qué proceso la produjo. |

En **Frontend → Metrics**, Railway expone gráficas de CPU, memoria, tráfico público, solicitudes, tasa de error y latencia. La vista sirve para detectar nivel y tendencia del contenedor, pero no atribuye el uso a V8, Node o cgroup. Si hace falta ese desglose, despliega temporalmente instrumentación **sólo en el runtime Node del Frontend** que escriba al log, al iniciar y cada 60 segundos, hora, PID, uptime y las métricas de la tabla. Lee `memory.current`, `memory.max` y `memory.stat` desde `/sys/fs/cgroup`; si esos archivos no están disponibles, registra el desglose como no disponible, sin sustituirlo por cero. Si `memory.max` contiene `max`, registra que el cgroup no publica un límite numérico.

Compara el arranque, al menos 30 minutos en reposo después de la estabilización inicial, una navegación controlada que solicite catálogo/imágenes y otros 15 minutos en reposo. Usa el mismo despliegue y no registres solicitudes, URL, cabeceras, datos personales ni variables de entorno. Si la curva no se estabiliza, prolonga la observación antes de concluir. Al terminar, retira la instrumentación y vuelve a desplegar.

Aplica la corrección según la señal: crecimiento persistente de `heapUsed` lleva a buscar referencias JavaScript retenidas; crecimiento de `external`/`arrayBuffers` apunta a buffers u otras asignaciones externas; RSS alto con heap estable requiere perfilar memoria nativa del proceso; `memory.current` alto frente a RSS obliga a revisar otros procesos, caché de archivos y kernel. Correlaciona cualquier aumento con solicitudes de imágenes antes de cambiar el optimizador. Para Backend/Worker, conserva los pools acotados de `backend/src/database/prisma-client.js` y el procesamiento serial del Worker. No cambies límites, cachés, opciones de Next.js ni réplicas sin una señal que vincule la medida con esa decisión.

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

### Resolver problemas de configuración

| Síntoma | Qué revisar |
|---|---|
| Pre-deploy: `Cannot resolve environment variable: DATABASE_URL` o Prisma no puede resolverla | Confirma que `DATABASE_URL` esté en el servicio API y que el nombre de servicio y de cada variable fuente coincida exactamente. Usa la fórmula de la plantilla y verifica que resuelva al host privado de PostgreSQL. Revisa también si hay cambios staged sin aplicar. |
| Railway muestra `<empty string>` en `DATABASE_URL` | La referencia no está entregando una URL utilizable. Comprueba el servicio fuente, `PGUSER`, `POSTGRES_PASSWORD`, `RAILWAY_PRIVATE_DOMAIN`, `PGDATABASE` y el conjunto de cambios staged; no intentes resolverlo quitando y reponiendo comillas. Usa la fórmula explícita de la plantilla y confirma en los logs de Prisma que aparece el host privado antes de seguir. |
| Prisma termina las migraciones, pero la API falla con `TypeError: Invalid URL` y entrada `https://` | Revisa `FRONTEND_ORIGIN`: la URL llegó sin hostname. Confirma que el servicio de frontend tenga dominio público en el mismo entorno y que la referencia use el nombre exacto de ese servicio. Guarda y aplica el cambio; después comprueba que la URL resuelta sea `https://<hostname>`. Si el panel aún no permite obtener el dominio, usa el paso temporal de 1.1 y reemplázalo antes de probar usuarios. No vuelvas a ejecutar migraciones por este error de arranque. |
| Cambié variables, pero el redeploy repite el valor anterior | En el lienzo del entorno revisa si queda **Apply changes / Apply N changes**. Abre **Details**, confirma que incluya el servicio y las variables correctas, y despliega ese conjunto staged; verifica luego el despliegue y sus logs. |
| La API cae al iniciar con error de formato de `STRIPE_SECRET_KEY` | Comprueba que `STRIPE_MODE=test` y que `STRIPE_SECRET_KEY` sea la clave secreta de prueba de Stripe que comienza con `sk_test_`. No uses una clave publicable `pk_test_…`, una clave live `sk_live_…`, un marcador de la plantilla ni la clave del webhook. La aplicación valida el prefijo al iniciar, antes de abrir el puerto. |
| El Worker cae con `TypeError: Invalid URL`, `input: 'https://'` y stack trace en `src/server.js` / `createApp` | Railway inició el servidor de API en el servicio Worker. En **Settings → Deploy → Start Command**, configura `node src/worker.js`; la imagen compartida trae `node src/server.js` como comando predeterminado de API. Después corrige `FRONTEND_ORIGIN` en el Worker: debe resolverse a un hostname completo y usar la capitalización exacta del servicio frontend. El comando incorrecto explica el crash; el origen vacío también impediría que los enlaces de correo regresen al frontend correcto. |
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
4. No cambies valores existentes sin presupuesto aprobado.


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

### Conectar el dominio propio de Producción

1. En **Frontend → Settings → Networking → Custom Domain**, añade el hostname aprobado. Copia los registros DNS que Railway indique para ese hostname y créalos en el proveedor DNS autoritativo, sin alterar los registros de correo.
2. Espera a que Railway confirme el dominio y el certificado TLS. Comprueba HTTPS antes de habilitar usuarios.
3. Cambia `FRONTEND_ORIGIN` en Backend y Worker al mismo origen definitivo `https://<dominio>`, sin ruta ni barra final. La referencia `Frontend.RAILWAY_PUBLIC_DOMAIN` representa el dominio generado por Railway; no presupongas que cambia al añadir un dominio personalizado. Aplica las variables y redespliega ambos servicios.
4. Autoriza el nuevo hostname en el widget Turnstile de Producción. Conserva el proxy y `INTERNAL_API_URL` privados. El destino Stripe continúa usando el dominio público de Backend; sólo actualízalo si éste cambia.
5. Comprueba registro, login, enlaces de correo, recuperación y retorno de Checkout desde el dominio definitivo. Las sesiones del hostname anterior no se transfieren al nuevo: inicia sesión de nuevo.

Mantén `ROBOTS_INDEXABLE=false` durante la preparación. Cámbiala a `true` sólo al aprobar la salida pública y completar la configuración canónica, `robots.txt`, `sitemap.xml` y metadatos de la fase 10.

### Respaldos y recuperación

Antes de Producción, comprueba qué respaldo automático y PITR permite el plan de Railway. Si no cubre la recuperación requerida, configura un volcado lógico automatizado en almacenamiento separado con acceso restringido. Prueba una restauración en una base aislada antes de depender del respaldo. Railway restaura respaldos de volumen dentro del mismo proyecto y entorno. Consulta [respaldos de volumen](https://docs.railway.com/volumes/backups), [PITR](https://docs.railway.com/volumes/point-in-time-recovery) y [respaldo/restauración PostgreSQL](https://docs.railway.com/guides/postgres-backups-restores).

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
