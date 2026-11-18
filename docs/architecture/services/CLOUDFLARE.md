# Mapa de implementación de Cloudflare

> **Preparación en curso:** verificar los recursos, DNS y controles de cada entorno antes de aplicar estos pasos. La presencia de esta guía no acredita un despliegue.

Crear buckets, habilitar su acceso público, añadir dominios o cambiar registros DNS modifica servicios externos; requiere autorización explícita antes de hacerlo. No se ha aplicado ningún cambio desde esta guía.

> Este documento resume la función de Cloudflare y el orden de su configuración pública. La preparación de R2, el inventario de medios y su integración tienen una sola guía: [Cloudflare R2 para los medios](R2.md). Verifica la documentación vigente del proveedor al configurar cada cuenta.

## Qué se configura en cada servicio

Cloudflare puede administrar la zona DNS, el proxy/CDN y R2 desde una cuenta. R2 se activa por separado; agregar un dominio no crea buckets ni habilita su acceso público. [Inicio de R2](https://developers.cloudflare.com/r2/get-started/)

El dominio puede estar registrado en cualquier registrador. Para la configuración habitual de Cloudflare Free, se agrega la zona a Cloudflare y se cambian los *nameservers* en el registrador. Antes de hacerlo, revisa y copia los registros DNS existentes, especialmente los de correo y verificación. [Configuración DNS principal](https://developers.cloudflare.com/dns/get-started/), [cambio de nameservers](https://developers.cloudflare.com/dns/nameservers/update-nameservers/)

Para el dominio de este proyecto, la [guía de Resend](RESEND.md) explica cómo identificar la zona actual y conservar los registros antes de cualquier cambio de delegación.

Cloudflare administra la entrada pública y los medios; Railway ejecuta Next.js, Express, PostgreSQL y el worker. Las conexiones internas entre servicios Railway —por ejemplo, Next.js a Express durante SSR y Express a PostgreSQL— permanecen dentro de su red privada.

Turnstile es un producto de verificación antiabuso independiente de DNS, proxy/CDN y R2. Para staging no hace falta migrar nameservers ni activar el proxy: se permite el hostname público del frontend en el widget y la API valida los tokens mediante Siteverify. La [guía de Railway](RAILWAY.md#turnstile-de-staging) indica qué clave va en cada servicio. Usa widgets y claves separados para desarrollo, staging y producción; el secreto nunca se configura en el frontend.

La compra de prueba y el correo con PDF del proyecto actual aún deben comprobarse en staging. El estado actual de dominios y DNS debe verificarse en los proveedores; no se deduce sólo del repositorio.

## Orden por fase

### 1. Preparar R2 para desarrollo y staging

Sigue la [guía dedicada de R2](R2.md) para preparar el inventario de medios y sus claves estables. Crea un bucket exclusivo para Staging, separado del bucket que ya usa el entorno local y del bucket futuro de Production. La carga del MVP es manual; no agregues credenciales de escritura a la aplicación. Para este entorno no productivo se puede usar la Public Development URL `r2.dev`, que Cloudflare limita y reserva para desarrollo. El bucket y el hostname de producción se preparan aparte; `r2.dev` no es una URL de producción. [Buckets públicos de R2](https://developers.cloudflare.com/r2/buckets/public-buckets/).

La integración de R2 no requiere cambiar DNS cuando se usa `r2.dev`. Configura la misma URL base de Staging en `MEDIA_BASE_URL` del frontend y backend y en `STRIPE_MEDIA_BASE_URL` de la API. Consulta el [roadmap](../../ROADMAP.md) antes de activar servicios externos.

**Criterio de avance:** la aplicación de Staging muestra los medios previstos desde su propio bucket con claves estables, sin guardar URL temporales ni exponer credenciales.

### 2. DNS y dominios públicos en staging — opcional

Para comenzar, usa los dominios públicos que Railway genera para el frontend y la API. No migres nameservers, no agregues una zona a Cloudflare ni actives el proxy como requisito de staging. Turnstile funciona en sitios que no pasan por la red proxy de Cloudflare; basta con permitir el hostname Railway del frontend en el widget y validar el token desde la API mediante Siteverify. [Turnstile es independiente del proxy](https://developers.cloudflare.com/turnstile/get-started/).

Si el responsable del proyecto dispone de un dominio de staging y solicita conectarlo, configura sólo los registros que Railway muestre para el frontend y la API. Añade en el DNS autoritativo los valores `CNAME` y `TXT` indicados por Railway. Si la zona no está activa en Cloudflare, no cambies su delegación por este solo motivo. Prueba primero los dominios con DNS sin proxy; habilitar el proxy, cambiar nameservers o editar la zona requiere una decisión y autorización aparte. Conserva separados los registros de correo y verificación. [Dominios de Railway](https://docs.railway.com/networking/domains/working-with-domains), [cambio de nameservers en Cloudflare](https://developers.cloudflare.com/dns/nameservers/update-nameservers/).

Si se requiere un hostname de medios personalizado en staging, conecta un dominio al bucket desde R2 sólo cuando la zona correspondiente esté activa en la cuenta Cloudflare prevista. Ese hostname apunta al bucket, no a Railway. Probar el hostname de medios es independiente de la ruta de Railway para tienda/API. WAF, Bot Fight Mode y proxy son controles separados; no se asume que el proxy active los demás. [Dominios personalizados de R2](https://developers.cloudflare.com/r2/buckets/public-buckets/).

**Criterio de avance:** con los dominios Railway predeterminados, tienda, API y medios funcionan por HTTPS y los medios permanecen aislados de Production. Un dominio propio sólo se considera validado si se configuró y probó expresamente.

### 3. Preparar Cloudflare para producción

- Crear un bucket de producción separado de Staging y configurar su origen público mediante <code>MEDIA_BASE_URL</code>.
- Usar un dominio personalizado para los medios públicos; <code>r2.dev</code> está limitado a tráfico de desarrollo y no es una URL de producción.
- Conectar los hostnames de tienda y API a sus servicios Railway y configurar DNS/TLS sólo cuando el dominio real esté disponible. Railway entrega los valores exactos `CNAME` y `TXT` para cada dominio personalizado; cópialos en el DNS autoritativo y verifica ambos registros antes de probar HTTPS. No hace falta cambiar nameservers si se conserva el proveedor DNS actual.
- Si se elige Cloudflare como DNS autoritativo, agrega la zona, revisa la importación de registros y compara los registros web, MX, SPF, DKIM, DMARC y verificaciones con el proveedor actual. Cambiar los nameservers en el registrador afecta toda la zona y requiere autorización explícita del responsable del proyecto. Para el dominio de envío, sigue primero la guía de [Resend](RESEND.md) y conserva los registros existentes.
- Empieza con los registros web sin proxy y valida tienda, API, medios, checkout y webhook. Activa el proxy sólo si se ha elegido esa capa y se comprueban sus efectos; WAF y Bot Fight Mode son controles separados. Si se configura Cloudflare delante de Railway, verifica el certificado TLS del origen y la compatibilidad del modo elegido antes de activar **Full (Strict)**. [Proxy de Cloudflare](https://developers.cloudflare.com/dns/proxy-status/use-cases/), [Full (Strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).
- Mantener PostgreSQL y el worker sin hostname público; exponer sólo los servicios que reciben tráfico externo.
- Usar secretos y recursos distintos de staging, almacenados en la configuración privada del proveedor.

**Criterio de cierre:** producción no depende de <code>r2.dev</code>; los servicios públicos y los medios usan los hostnames de producción y la configuración se valida con los procedimientos de operación y recuperación documentados. La salida pública, los cambios de DNS y los cobros reales siguen bloqueados hasta sus autorizaciones explícitas.

## Decisiones reservadas

El dominio definitivo, los nombres de buckets, la política de caché y las credenciales se definen al preparar cada entorno. La carga del MVP es manual. No se ha configurado aquí ningún dominio, zona, DNS, proxy ni bucket de staging. Si en el futuro la aplicación necesita escribir en R2, primero se debe definir el flujo y sus permisos.
