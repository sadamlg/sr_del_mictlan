# Resend · correo transaccional

Esta guía explica el envío con Resend desde el Worker, la autenticación DNS del dominio remitente y la separación entre Local, Staging y Production. Usa los valores que el proveedor genere para el dominio elegido; no guardes secretos ni el estado de una cuenta en el manual. Para distinguir registrador y DNS autoritativo, consulta [NEUBOX.md](NEUBOX.md).

El Worker usa Resend por HTTPS en los entornos que lo configuren. La API no necesita ni recibe `RESEND_API_KEY`. Compose usa SMTP hacia Mailpit por defecto y permite activar Resend localmente de forma opcional.

## Minicurso: cómo funciona el correo en esta aplicación

### El recorrido en una frase

El API registra en PostgreSQL que hay un correo pendiente; el Worker independiente toma ese trabajo, construye el mensaje y lo entrega mediante el transporte elegido para el entorno. En local ese transporte es SMTP hacia Mailpit; en un Worker configurado con Resend es una petición HTTPS a la API de Resend. El navegador nunca envía el correo ni recibe la clave de Resend.

```text
Navegador → API → PostgreSQL (trabajo de correo)
                         ↑             ↓
                         └──────── Worker
                                      ├─ SMTP → Mailpit (local)
                                      └─ HTTPS → Resend → bandeja destinataria
```

### SMTP frente a la API HTTPS de Resend

SMTP es un protocolo para entregar mensajes a un servidor de correo. En el código, `smtp-transport.js` usa Nodemailer y `EMAIL_TRANSPORT=smtp`; Compose conecta el Worker al servicio `mailpit` por el puerto interno `1025`. Mailpit recibe el mensaje y lo deja visible en su interfaz local en `http://localhost:8025`. No lo reenvía a Gmail ni a Internet.

El transporte de Resend no usa SMTP. `resend-transport.js` hace `POST https://api.resend.com/emails` con HTTPS y la clave en `Authorization: Bearer …`; también convierte el PDF adjunto a Base64 y, para compras, transmite la clave de idempotencia. El servidor de Resend acepta la solicitud y luego intenta entregarla al destinatario. La configuración Compose predeterminada entrega a Mailpit; al seleccionar `EMAIL_TRANSPORT=resend`, el Worker local puede enviar a una bandeja real controlada.

Compose usa `EMAIL_TRANSPORT=smtp` por defecto. Mailpit permite revisar el mensaje sin enviar correo a destinatarios externos ni configurar una clave Resend. Para validar la llamada real a Resend desde el Worker local, sigue el procedimiento opcional de abajo; Staging sigue siendo necesario para comprobar remitentes, dominio y configuración de ese entorno.

### Probar Resend localmente (opcional)

El código del Worker admite ambos transportes. Para probar la integración HTTPS desde Compose, configura en `.env` `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY` con una clave local de alcance mínimo y remitentes `MAIL_FROM` y `RESEND_FROM` autorizados en un dominio verificado de Resend. No reutilices la clave de Staging o Producción. La API key sólo se entrega al Worker.

Mantén `FRONTEND_ORIGIN` apuntando a `http://localhost:3000` para que los enlaces de confirmación y recuperación regresen al entorno local. Usa una bandeja de control propia y autorizada: esta opción envía correo real, consume los límites de la cuenta y puede generar cargos. No la uses para destinatarios de clientes ni con datos personales de producción.

Recrea el Worker para aplicar la selección y las credenciales:

```bash
docker compose up --detach --force-recreate worker
```

Para volver a la ruta aislada, cambia `EMAIL_TRANSPORT=smtp`, deja `RESEND_API_KEY` vacía y recrea el Worker. El mensaje vuelve a aparecer en Mailpit en `http://localhost:8025`.

### Dominio de la tienda, subdominio de envío y DNS

El dominio de la tienda y el subdominio remitente (`mail.<dominio>`, por ejemplo) son identidades DNS distintas. Verificar un dominio remitente en Resend no publica la web, no crea una cuenta de correo y no cambia el destino del dominio web.

Los registros se editan en el proveedor que sirve los nameservers autoritativos del dominio. Un panel de registrador puede mostrar una zona editable aunque no sea la pública; comprueba la delegación antes de editar. Los registros concretos que se deben publicar son los que la cuenta de Resend muestra para el dominio configurado: no se deducen ni se copian de otra cuenta.

Los términos DNS más comunes en la autenticación de correo son:

- **SPF:** registro TXT que declara qué servicios están autorizados a enviar para el dominio correspondiente. Si ya existe SPF para otros servicios, se revisa y combina según corresponda; no se crea un segundo SPF para el mismo nombre ni se reemplaza a ciegas el existente.
- **DKIM:** firma criptográfica que el servicio de envío aplica al mensaje. Resend proporciona los nombres y valores DNS que necesita para validar esa firma; se publican tal como aparecen en **Domains → Records**.
- **DMARC:** política publicada por el dueño del dominio que permite a los servidores receptores evaluar la alineación de SPF o DKIM con el dominio visible en `From` y, si se configura, enviar reportes. No sustituye los registros SPF/DKIM. La política vigente de la organización debe revisarse antes de crearla o cambiarla.

El subdominio de envío separa la identidad de correo de la web y ayuda a no sobrescribir la configuración del buzón raíz. No se cambia MX, SPF, DKIM, DMARC ni nameservers existentes sin comparar la zona actual y los registros exactos de Resend.

### Remitentes y claves

El encabezado `From` visible para quien recibe el mensaje y la dirección `To` cumplen papeles distintos. El código usa:

- `MAIL_FROM` para confirmación de cuenta, cambio de correo y recuperación de contraseña.
- `RESEND_FROM` para confirmación de compra con su PDF adjunto.
- La dirección del cliente o destinatario guardada en la cuenta o pedido como `To`; en pruebas usa una bandeja controlada y autorizada.

El dominio del remitente debe estar autorizado en Resend. Identidades como `cuentas@mail.<dominio>` y `pedidos@mail.<dominio>` son ejemplos, no prueba de que existan buzones para recibir respuestas. La clave se crea en Resend y se instala como secreto `RESEND_API_KEY` sólo en el Worker; no se introduce en DNS, navegador ni API. El proveedor DNS recibe los valores de registros, nunca la clave API.

### Quién crea y valida los enlaces

El API no incluye tokens en la respuesta de registro o recuperación. Cuando corresponde, guarda en PostgreSQL un trabajo en `email_jobs`. El Worker genera un token opaco, guarda su hash y vencimiento en `account_tokens`, y redacta el correo con el enlace. El token sin hash aparece en el mensaje para que su destinatario pueda presentarlo; la base de datos no conserva ese valor legible.

- El correo de activación usa `/cuenta/confirmar-correo`; el token vence en 24 horas y puede usarse una sola vez.
- El cambio de dirección también usa `/cuenta/confirmar-correo`, pero confirma la dirección nueva pendiente; vence en 24 horas y puede usarse una sola vez.
- La recuperación usa `/cuenta/restablecer-contrasena`; el token vence en 30 minutos y puede usarse una sola vez.

La página del frontend lee el token de la URL y lo envía al API. El API busca el hash, verifica propósito, vencimiento y que no esté consumido, y realiza la confirmación o el cambio de contraseña dentro de una operación transaccional. Un token inválido, vencido o usado se rechaza. En recuperación, la respuesta al pedido de instrucciones es genérica para no revelar si el correo tiene una cuenta; solo se encola correo si existe una cuenta verificada.

`FRONTEND_ORIGIN` define el origen público de ese frontend en cada entorno, sin ruta, query ni fragmento. El Worker lo usa como base para los enlaces anteriores y para la imagen de marca incluida en los correos. El API valida el mismo origen para CORS, el hostname de Turnstile y las URLs de retorno de Stripe Checkout. Debe coincidir con el frontend del entorno: si se deja el valor local en Railway, los enlaces llevarán a `localhost`; si se copia un origen de Staging en Producción, los mensajes dirigirán al entorno equivocado. Valores de referencia:

| Entorno | Forma de `FRONTEND_ORIGIN` |
|---|---|
| Local | `http://localhost:<puerto-frontend>` |
| Staging | `https://<hostname-frontend-staging>` |
| Producción | `https://<dominio-frontend-produccion>` |

### Cola de correo, pedido y PDF

El API guarda el trabajo en PostgreSQL; no espera a que Resend o Mailpit termine para responder al usuario. El Worker independiente consulta la cola cada dos segundos, reclama un trabajo con bloqueo en la base y lo procesa. Por tanto, que Stripe regrese al navegador o muestre el pago no es por sí solo la condición para enviar el correo de compra: el webhook validado confirma y marca el pedido `PAID`; en la misma transacción se crea un solo trabajo de compra y se limpia el carrito.

Para ese trabajo, el Worker carga la instantánea del pedido pagado, genera en memoria un solo `detalle-pedido-<id>.pdf` y lo adjunta al mensaje. El código no guarda el PDF como archivo ni como campo de base de datos. Una caída del transporte no deshace el pago; el trabajo queda disponible para reintento en PostgreSQL.

La base evita crear otro trabajo de compra para el mismo pedido y los webhooks repetidos no vuelven a aplicar la confirmación. Además, para la API de Resend el Worker envía `purchase/<id-del-pedido>` como clave idempotente estable. Eso reduce envíos duplicados al reintentar cerca del primer intento, dentro del periodo de retención que documenta Resend. No equivale a entrega exactamente una vez: la clave del proveedor tiene retención limitada y una caída después de que el proveedor acepte el mensaje pero antes de guardar `SENT` puede requerir un reintento. El transporte SMTP local no envía esa clave al proveedor. Los correos de cuenta tampoco usan actualmente una clave idempotente de Resend.

Los fallos se persisten con estado e intentos. Se permiten hasta cinco intentos; el retraso se calcula con backoff exponencial (`2^intentos` segundos, con tope de cinco minutos). Si el proceso muere y deja un trabajo `PROCESSING`, puede reclamarse después de dos minutos; al alcanzar el límite queda `FAILED`. Un operador debe inspeccionar y decidir cómo recuperar un fallo terminal; no se debe asumir que el correo se entregó porque el pago sí quedó confirmado.

## Preparación de cuenta y dominio

1. Seleccionar la cuenta y el equipo de Resend existentes del proyecto. No crear otra cuenta ni volver a registrar el dominio hasta comprobarlo. Activar MFA y limitar el acceso administrativo.
2. Antes de habilitar uso, revisar en el panel el plan vigente, volumen permitido, límites diarios, cargos por excedentes, método de pago y alertas. Confirmar un presupuesto aprobado. No habilitar sobreconsumo ni añadir un medio de pago sin esa aprobación. Los precios y límites pueden cambiar; consultar la [página vigente de precios](https://resend.com/pricing).
3. Elegir un subdominio remitente dedicado, si la arquitectura y política de correo lo permiten. Consultar la [guía oficial para añadir un dominio](https://resend.com/docs/add-a-domain).
4. En Resend, abrir **Domains → <dominio-remitente> → Records** y copiar los valores exactos que muestre el panel: tipo, nombre/host, valor, TTL y prioridad cuando aplique. Si el dominio no aparece en la cuenta, confirmar el equipo correcto antes de volver a añadirlo.
5. Comparar esos registros con la zona DNS autoritativa. Si coinciden y Resend lo marca verificado, no cambiar DNS. Si falta o difiere alguno, editar sólo el registro indicado en el proveedor autoritativo.
6. No crear registros desde **Child Nameservers**, no registrar glue records y no cambiar ni delegar los nameservers de la zona para verificar TXT, CNAME o MX. La verificación requiere registros en la zona DNS autoritativa actual; no una migración de DNS.
7. Esperar a que el panel de Resend marque el dominio como verificado. La propagación puede tardar; contrastar en el panel los registros publicados con los valores exactos generados y corregir sólo el registro correspondiente. No se considera verificado por haber guardado cambios en el proveedor DNS.
8. En Resend, crear una clave API con el menor alcance de envío disponible. La clave se configura como secreto del Worker de Railway en los entornos que usan Resend y, sólo si se elige la prueba opcional local, en el `.env` ignorado por Git. No se introduce en el API, cPanel ni como registro DNS. Crear claves distintas por entorno; nunca incluir su valor en `.env.example`, Git, logs, tickets o mensajes, y rotarla/revocarla si se expone.
9. Configurar remitentes autorizados en ese dominio. El remitente de cuenta va en `MAIL_FROM`; el remitente de compras va en `RESEND_FROM`. Por ejemplo: `Nombre del comercio <cuentas@mail.<dominio>>` y `Nombre del comercio <pedidos@mail.<dominio>>`. La verificación de envío no crea buzones para recibir respuestas.

### Publicar registros en la zona autoritativa

1. Consulta los nameservers delegados del dominio y determina qué proveedor sirve la zona activa. El registrador y el editor DNS pueden ser servicios distintos.
2. Guarda un inventario de los registros A/AAAA, CNAME, MX, TXT (SPF, DKIM, DMARC) y verificaciones actuales, especialmente los que sostienen web y correo.
3. En Resend, abre **Domains → <dominio-remitente> → Records** y copia los registros solicitados.
4. Compara tipo, nombre/host, valor/destino, TTL y prioridad con la zona activa. Si coinciden, no los dupliques; si falta uno, edita sólo ese registro en el proveedor autoritativo.
5. No borres ni reemplaces MX, SPF, DKIM o DMARC de otros servicios. Si Resend solicita un MX de retorno, conserva el hostname exacto que muestra el proveedor; no lo sustituyas por el dominio raíz.
6. Vuelve a Resend y ejecuta **Verify**. Si no pasa, revisa nombre final, valor, prioridad y propagación. No cambies nameservers para corregir un registro individual.

Hoja reproducible para comparar los valores de Resend con la zona existente. Agrega una fila por cada entrada que muestre **Records**.

| # | Tipo | Nombre/host mostrado por Resend | Valor/destino | TTL | Prioridad | Nombre final en la zona DNS | Verificado |
|---|---|---|---|---|---|---|---|
| 1 | `<tipo>` | `<nombre/host>` | `<valor/destino>` | `<TTL>` | Si aplica | `<nombre final en DNS>` | `<pendiente/verificado>` |

## Variables por entorno

Configurar las variables en el servicio **Worker** de cada entorno Railway, no en la API ni en el frontend:

| Variable | Uso |
|---|---|
| `EMAIL_TRANSPORT` | `resend` en el Worker de Railway habilitado para ese entorno. |
| `RESEND_API_KEY` | Clave secreta separada por entorno; sólo se entrega al Worker. |
| `MAIL_FROM` | Remitente de confirmación, recuperación y otros mensajes de cuenta. |
| `RESEND_FROM` | Remitente de confirmación de compra con PDF. |
| `FRONTEND_ORIGIN` | Origen público del mismo entorno para enlaces de cuenta. |

Staging y Producción deben usar variables, claves, remitentes, dominios (o subdominios) y límites separados. Nunca reutilices claves entre entornos; la presencia de una variable no acredita que la clave sea válida ni que Resend acepte los remitentes.

El Worker debe recibir `DATABASE_URL`, además de las variables anteriores. No colocar `RESEND_API_KEY` en el servicio API, configuración compartida de todo el proyecto, build args, imagen Docker o variables públicas. La integración hace `POST https://api.resend.com/emails` por HTTPS con `RESEND_API_KEY` en `Authorization`; no usa SMTP ni `SMTP_PASSWORD` para Resend.

En Compose local se usa `EMAIL_TRANSPORT=smtp` hacia Mailpit si no se cambia la selección. La prueba opcional de Resend configura la clave sólo en el Worker local; la guía anterior describe ese recorrido. Staging debe verificarse por separado con su propia clave, dominio, remitentes y destinatarios de control.

## Recorrido por entorno

### Local

1. El navegador local habla con el API local. El API escribe en PostgreSQL un trabajo para la confirmación de cuenta, la recuperación, el cambio de correo o la compra pagada.
2. Con la configuración predeterminada, el Worker de Compose reclama el trabajo y usa SMTP hacia Mailpit. Revisa el mensaje en `http://localhost:8025`; no aparecerá en la cuenta Gmail real del destinatario. Si se activa Resend local, el Worker envía a la bandeja real controlada que se configuró.
3. Para activación o recuperación, abre desde el navegador local el enlace a `http://localhost:3000`, y la página envía el token al API local para validarlo y consumirlo.
4. Para una compra, usa Stripe en modo de prueba y entrega el webhook de prueba al API local. Sólo después de que el API valide el webhook y confirme el pedido se crea el trabajo de correo. El Worker genera el PDF en memoria y lo adjunta al mensaje visible en Mailpit, o lo envía a la bandeja controlada si se selecciona Resend.
5. Si falla el transporte, PostgreSQL conserva el trabajo para los reintentos configurados. Mailpit permite revisar contenido y recuperación sin entrega externa; Resend local valida la llamada externa, pero no sustituye la verificación de configuración de Staging.

### Staging

El siguiente recorrido describe cómo configurar y verificar el envío externo en Staging.

En Staging, separa Frontend, API y Worker y conecta API y Worker a la base PostgreSQL del mismo entorno. Configura `FRONTEND_ORIGIN` en API y Worker con el hostname del Frontend de ese entorno. En Worker selecciona `EMAIL_TRANSPORT=resend` y configura una clave exclusiva de Staging, `MAIL_FROM`, `RESEND_FROM` y `DATABASE_URL`. El API recibe su configuración de aplicación y base de datos, pero no `RESEND_API_KEY`.

Con esa configuración, registro, recuperación y cambio de correo generan trabajo y el Worker envía enlaces que regresan al frontend de Staging. Para compras, usa Stripe de prueba; el webhook recibido por el API confirma el pago, persiste el único trabajo, y el Worker genera y adjunta el PDF a la solicitud HTTPS de Resend. Resend intenta entregarlo a una bandeja controlada y autorizada. Revisa el estado de entrega, el enlace al entorno, el PDF, los reintentos ante un fallo controlado y la idempotencia ante la repetición del webhook.

El Worker usa Resend para notificaciones de Staging. Valida la entrega de cuenta y compra con destinatarios de prueba antes de aceptar el entorno; usa clave y remitente distintos de Production. Las variables por servicio se describen en la [guía de Railway](RAILWAY.md).

### Producción

El mismo flujo se configura en Production con `FRONTEND_ORIGIN=https://<dominio-produccion>`, `EMAIL_TRANSPORT=resend`, una clave separada de Staging, remitentes autorizados en el dominio elegido y API/Worker conectados a la base de Production. La clave vive sólo como secreto del Worker. Los enlaces deben regresar al sitio público y la imagen de marca del correo debe cargar desde un origen accesible.

Un pedido solo produce confirmación después de que el API acepta el webhook de pago y guarda `PAID`; el PDF se genera en memoria, se adjunta al correo y no se almacena en PostgreSQL. Los mismos reintentos e idempotencia aplican, pero los mensajes se dirigen a destinatarios reales. Hasta que se autorice esa activación, la integración de Producción permanece apagada; una prueba de Staging no sustituye la verificación de variables, claves, DNS, remitentes, destinatarios y límites de Producción.

### Rendimiento, seguridad y costos

- **Rendimiento:** la API encola el correo y el Worker lo envía fuera de la solicitud del usuario. Vigila el tiempo que el trabajo permanece en cola, los reintentos, límites de envío y tamaño de los adjuntos.
- **Seguridad:** guarda la API key como secreto exclusivo del Worker, limita su alcance, rótala si se expone y evita registrar destinatarios, tokens, claves, cuerpo o adjuntos. Publica SPF/DKIM y adopta una política DMARC compatible con el dominio existente.
- **Costos:** considera volumen enviado, nivel del plan, adjuntos y reintentos. Revisa límites y [precios vigentes](https://resend.com/pricing) antes de activar envíos reales; no deduzcas costo sólo por tener una API key.

## Cola, reintentos y límites de idempotencia

PostgreSQL guarda la cola; la transición verificada de un pedido a `PAID` crea un trabajo `PURCHASE_CONFIRMATION` con `orderId` único. El Worker arma el correo desde la instantánea del pedido pagado y adjunta un único PDF. Los webhooks de pago repetidos no crean un segundo trabajo. Las reclamaciones, leases, intentos y reintentos permanecen en PostgreSQL.

Para compras, el Worker envía la clave idempotente estable `purchase/<order UUID>` a Resend. Resend conserva las claves por 24 horas; esto reduce duplicados en reintentos cercanos, pero no promete entrega exactamente una vez ante cualquier caída o reintento posterior a esa ventana. SMTP local no implementa la deduplicación del proveedor. La guía de [claves idempotentes](https://resend.com/docs/dashboard/emails/idempotency-keys) describe ese límite. Los logs del Worker sólo contienen ID/tipo/intento/código seguro; no deben incluir destinatario, dirección, token, clave ni contenido.

## Verificación de la futura configuración

- Capturar en evidencia —sin valores secretos— el entorno, commit desplegado, estado del dominio en Resend, remitentes permitidos, variables presentes por nombre y límites revisados.
- En Staging, probar confirmación de cuenta, recuperación y compra con pago de prueba; comprobar el mensaje en Resend y la bandeja de prueba, el PDF único, los enlaces del entorno y la recuperación de trabajos fallidos.
- Revisar en los logs que no aparezcan destinatarios, domicilios, tokens, contenido del PDF, respuestas completas de proveedor ni claves.
- No enviar pruebas a personas reales ni activar Producción para cerrar esta guía. Registrar por separado toda configuración pendiente.

## Referencias oficiales

- [Añadir y verificar un dominio](https://resend.com/docs/add-a-domain)
- [Enviar correo y adjuntar archivos](https://resend.com/docs/api-reference/emails/send-email)
- [Claves idempotentes de correo](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Introducción a dominios](https://resend.com/docs/dashboard/domains/introduction)
- [Precios vigentes](https://resend.com/pricing)
