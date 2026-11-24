# Cloudflare: DNS, proxy y capa pública

Esta guía explica cómo conectar DNS, proxy/CDN, TLS y R2. Confirma el proveedor y los recursos del entorno antes de aplicar cambios; la guía no registra el estado actual de una cuenta.

Crear buckets, habilitar acceso público, añadir dominios o cambiar registros DNS modifica servicios externos. Realiza esos pasos en una ventana autorizada y conserva su detalle en el registro del proveedor; actualiza el roadmap sólo si cambia un resultado de fase, una decisión o un bloqueo de aceptación.

> Este documento resume la función de Cloudflare y el orden de su configuración pública. La preparación de R2, el inventario de medios y su integración tienen una sola guía: [Cloudflare R2 para los medios](R2.md). Verifica la documentación vigente del proveedor al configurar cada cuenta.

## Qué se configura en cada servicio

Cloudflare puede administrar la zona DNS, el proxy/CDN y R2 desde una cuenta. R2 se activa por separado; agregar un dominio no crea buckets ni habilita su acceso público. [Inicio de R2](https://developers.cloudflare.com/r2/get-started/)

El dominio puede estar registrado en cualquier registrador. Para delegar DNS a Cloudflare, agrega la zona y cambia los *nameservers* en el registrador. Antes de hacerlo, revisa y copia los registros DNS existentes, especialmente los de correo y verificación. [Configuración DNS principal](https://developers.cloudflare.com/dns/get-started/), [cambio de nameservers](https://developers.cloudflare.com/dns/nameservers/update-nameservers/)

La [guía de Resend](RESEND.md) explica cómo conservar los registros de envío antes de cualquier cambio de delegación.

## Separación de entornos

| Perfil | Uso previsto | Regla de configuración |
|---|---|---|
| Local | No necesita DNS público; usa `localhost` y puede cargar medios desde R2 | Mantener fuera de la zona pública de la tienda |
| Staging | Hostnames Railway o subdominio dedicado; zona y medios no productivos | Separar del dominio público de Production y de sus registros |
| Production | Dominio aprobado hacia servicios productivos; hostname de medios R2 independiente | Mantener DNS, TLS y controles de borde alineados con el origen y las políticas de publicación |

El registrador y la zona DNS autoritativa son funciones distintas. Antes de editar registros, identifica quién sirve los nameservers y conserva los registros de correo/verificación. Consulta [NEUBOX.md](NEUBOX.md) y el [runbook de Producción](../../operations/PRODUCTION-RUNBOOK.md) para la secuencia entre servicios.

Cloudflare administra la entrada pública y los medios; Railway ejecuta Next.js, Express, PostgreSQL y el worker. Las conexiones internas entre servicios Railway —por ejemplo, Next.js a Express durante SSR y Express a PostgreSQL— permanecen dentro de su red privada.

### Turnstile

Turnstile es un producto de verificación antiabuso independiente de DNS, proxy/CDN y R2. Para staging no hace falta migrar nameservers ni activar el proxy: se permite el hostname público del frontend en el widget y la API valida los tokens mediante Siteverify. La [guía de Railway](RAILWAY.md#turnstile-de-staging) indica qué clave va en cada servicio. Usa widgets y claves separados para desarrollo, staging y producción; el secreto nunca se configura en el frontend.

La configuración DNS no sustituye la verificación independiente de correo, Checkout, medios ni servicios internos.

## Orden por fase

### 1. Preparar R2 para desarrollo y staging

Sigue la [guía dedicada de R2](R2.md) para preparar el inventario de medios, las variantes y sus claves estables. Crea un bucket exclusivo para Staging, separado del bucket local y del bucket de Production. La carga del MVP es manual; no agregues credenciales de escritura a la aplicación. Usa `r2.dev` sólo en desarrollo; para Staging y Production conecta dominios personalizados a los buckets de cada entorno y entrega los medios por CDN. `r2.dev` no ofrece esos controles de caché. [Buckets públicos de R2](https://developers.cloudflare.com/r2/buckets/public-buckets/).

La URL `r2.dev` de desarrollo no requiere cambios DNS; el dominio CDN de Staging se conecta al bucket desde sus ajustes y requiere una zona Cloudflare activa. Configura el origen del bucket correspondiente en `MEDIA_BASE_URL` del frontend y backend y en `STRIPE_MEDIA_BASE_URL` de la API. Consulta el [roadmap](../../ROADMAP.md) antes de activar servicios externos.

**Criterio de avance:** la aplicación de Staging muestra los medios previstos desde su propio bucket con claves estables, sin guardar URL temporales ni exponer credenciales.

### 2. DNS y dominios públicos en staging — opcional

Para comenzar, usa los dominios públicos que Railway genera para el frontend y la API. No migres nameservers, no agregues una zona a Cloudflare ni actives el proxy como requisito de staging. Turnstile funciona en sitios que no pasan por la red proxy de Cloudflare; basta con permitir el hostname Railway del frontend en el widget y validar el token desde la API mediante Siteverify. [Turnstile es independiente del proxy](https://developers.cloudflare.com/turnstile/get-started/).

Si el responsable del proyecto dispone de un dominio de staging y solicita conectarlo, configura sólo los registros que Railway muestre para el frontend y la API. Añade en el DNS autoritativo los valores `CNAME` y `TXT` indicados por Railway. Si la zona no está activa en Cloudflare, no cambies su delegación por este solo motivo. Prueba primero los dominios con DNS sin proxy; habilitar el proxy, cambiar nameservers o editar la zona requiere una decisión y autorización aparte. Conserva separados los registros de correo y verificación. [Dominios de Railway](https://docs.railway.com/networking/domains/working-with-domains), [cambio de nameservers en Cloudflare](https://developers.cloudflare.com/dns/nameservers/update-nameservers/).

Conecta el hostname de medios de Staging al bucket de R2 sólo cuando la zona correspondiente esté activa en la cuenta Cloudflare prevista. Ese hostname apunta al bucket, no a Railway. Verifica HTTPS y los encabezados de caché directamente en el hostname de medios; la validación es independiente de la ruta de Railway para tienda/API. WAF, Bot Fight Mode y proxy son controles separados; no se asume que el proxy active los demás. [Dominios personalizados de R2](https://developers.cloudflare.com/r2/buckets/public-buckets/).

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

## Rendimiento, seguridad y costos

- **Rendimiento:** el proxy/CDN puede reducir latencia para recursos cacheables. Define reglas específicas para medios estáticos; no caches respuestas de cuenta, API privada, Checkout o webhook sin una revisión de cookies, headers y comportamiento. Compara TTFB/latencia con y sin proxy antes de activarlo en un origen dinámico.
- **Seguridad:** valida TLS entre Cloudflare y Railway antes de elegir modo estricto; expón sólo Frontend y Backend que reciban tráfico público; mantén base y Worker privados. DNS proxy, WAF, protección de bots y reglas de caché son controles distintos. Si el tráfico de cuenta pasa por el proxy, añade una regla de rate limiting por IP que cubra sólo los métodos y rutas de autenticación/perfil del Frontend. Calibra un umbral conservador y una mitigación breve contra el tráfico normal esperado, incluidas redes compartidas; verifica que las páginas públicas no coincidan con la regla. Mantén también el límite de Backend por identidad: el hostname de origen de Railway puede recibir solicitudes sin pasar por Cloudflare. Si Backend usa varias réplicas, el límite de aplicación necesita un almacén compartido. Revisa el plan y los periodos disponibles en la [guía de rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/) antes de configurar la zona. Evalúa DNSSEC y conserva registros de correo/verificación al delegar la zona.
- **Costos:** DNS, proxy, WAF, reglas y productos adicionales pueden tener planes y cuotas distintas. Confirma el plan y el precio de cada producto en la [página de planes de Cloudflare](https://www.cloudflare.com/plans/) y revisa cuotas de R2/Images en sus guías antes de diseñar el tráfico o configurar alertas.

## Decisiones reservadas

Define el dominio de medios y la política de caché por entorno. La carga del MVP es manual. Los buckets de medios de Staging y Production deben mantenerse separados. Si la aplicación necesita escribir en R2, define primero el flujo y sus permisos.
