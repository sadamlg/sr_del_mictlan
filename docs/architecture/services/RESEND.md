# Resend · correo transaccional

## Estado

La integración de código está preparada. El responsable confirma que los registros DNS de Resend ya se cargaron en Neubox/cPanel. El panel de Resend mostró `mail.srmictlan.com` como verificado el 16 de noviembre de 2026; los valores DNS no se copiaron al repositorio. No volver a crear registros antes de comparar la zona actual con **Domains → Records**.

El dominio del proyecto es `srmictlan.com` y el subdominio elegido para envío es `mail.srmictlan.com`. Antes de aplicar cambios, confirma que el dominio sigue bajo control del proyecto y que la zona DNS autoritativa sigue en Neubox/cPanel; los valores DNS generados por la cuenta de Resend no se registran en esta guía.

La tienda no necesita estar publicada para verificar este subdominio. Hace falta controlar el dominio y poder editar su zona DNS autoritativa; por eso la configuración puede hacerse antes de que el hostname web apunte a la tienda.

El Worker usa Resend por HTTPS en los entornos que lo configuren. La API no necesita ni recibe `RESEND_API_KEY`. Compose usa SMTP hacia Mailpit.

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

El transporte de Resend no usa SMTP. `resend-transport.js` hace `POST https://api.resend.com/emails` con HTTPS y la clave en `Authorization: Bearer …`; también convierte el PDF adjunto a Base64 y, para compras, transmite la clave de idempotencia. El servidor de Resend acepta la solicitud y luego intenta entregarla al destinatario. Por eso una compra local en la configuración Compose actual aparece en Mailpit, mientras una compra procesada por un Worker configurado con `EMAIL_TRANSPORT=resend` puede llegar a una bandeja real.

Compose fija `EMAIL_TRANSPORT=smtp` en `compose.yaml`; establecer `EMAIL_TRANSPORT=resend` solo en `.env` no cambia ese valor. Mantén el recorrido local con SMTP y Mailpit: permite revisar el mensaje sin enviar correo a destinatarios externos ni instalar una clave Resend. La primera prueba de entrega real corresponde a Staging.

### Dominio de la tienda, subdominio de envío y DNS

`srmictlan.com` identifica el dominio de la tienda. `mail.srmictlan.com` es el subdominio separado elegido para los remitentes de correo. Verificarlo en Resend no publica la web, no crea una cuenta de correo y no cambia por sí solo el destino del dominio web. Son rutas DNS independientes.

Los registros se editan en el proveedor que sirve los nameservers autoritativos del dominio. El panel de Neubox/cPanel puede mostrar una zona editable aunque no sea la zona pública activa; por eso primero se comprueba la delegación. Si los nameservers apuntan a Neubox, se usa `cPanel → Zone Editor`; si apuntan a otro proveedor, se edita ahí. Los registros concretos que se deben publicar son los que la cuenta de Resend muestra para ese dominio: no se deducen ni se copian de otra cuenta.

Los términos DNS más comunes en la autenticación de correo son:

- **SPF:** registro TXT que declara qué servicios están autorizados a enviar para el dominio correspondiente. Si ya existe SPF para otros servicios, se revisa y combina según corresponda; no se crea un segundo SPF para el mismo nombre ni se reemplaza a ciegas el existente.
- **DKIM:** firma criptográfica que el servicio de envío aplica al mensaje. Resend proporciona los nombres y valores DNS que necesita para validar esa firma; se publican tal como aparecen en **Domains → Records**.
- **DMARC:** política publicada por el dueño del dominio que permite a los servidores receptores evaluar la alineación de SPF o DKIM con el dominio visible en `From` y, si se configura, enviar reportes. No sustituye los registros SPF/DKIM. La política vigente de la organización debe revisarse antes de crearla o cambiarla.

El subdominio de envío separa la identidad de correo de la web y ayuda a no sobrescribir la configuración del buzón raíz. No se cambia MX, SPF, DKIM, DMARC ni nameservers existentes sin comparar la zona actual y los registros exactos de Resend.

### Remitentes y claves

El encabezado `From` visible para quien recibe el mensaje y la dirección `To` cumplen papeles distintos. El código usa:

- `MAIL_FROM` para confirmación de cuenta, cambio de correo y recuperación de contraseña.
- `RESEND_FROM` para confirmación de compra con su PDF adjunto.
- La dirección del cliente o destinatario guardada en la cuenta o pedido como `To`; puede ser una dirección Gmail, por ejemplo `juan+prueba@gmail.com`.

El dominio del remitente debe estar autorizado en Resend. Los ejemplos propuestos (`cuentas@mail.srmictlan.com` y `pedidos@mail.srmictlan.com`) son identidades de envío, no prueba de que existan buzones que reciban respuestas. La clave se crea en Resend y se instala como secreto `RESEND_API_KEY` en el Worker que use la API; no se introduce en cPanel, en registros DNS, en el navegador ni en la API. En cambio, cPanel recibe los valores de registros DNS, nunca la clave API.

### Quién crea y valida los enlaces

El API no incluye tokens en la respuesta de registro o recuperación. Cuando corresponde, guarda en PostgreSQL un trabajo en `email_jobs`. El Worker genera un token opaco, guarda su hash y vencimiento en `account_tokens`, y redacta el correo con el enlace. El token sin hash aparece en el mensaje para que su destinatario pueda presentarlo; la base de datos no conserva ese valor legible.

- El correo de activación usa `/cuenta/confirmar-correo`; el token vence en 24 horas y puede usarse una sola vez.
- El cambio de dirección también usa `/cuenta/confirmar-correo`, pero confirma la dirección nueva pendiente; vence en 24 horas y puede usarse una sola vez.
- La recuperación usa `/cuenta/restablecer-contrasena`; el token vence en 30 minutos y puede usarse una sola vez.

La página del frontend lee el token de la URL y lo envía al API. El API busca el hash, verifica propósito, vencimiento y que no esté consumido, y realiza la confirmación o el cambio de contraseña dentro de una operación transaccional. Un token inválido, vencido o usado se rechaza. En recuperación, la respuesta al pedido de instrucciones es genérica para no revelar si el correo tiene una cuenta; solo se encola correo si existe una cuenta verificada.

`FRONTEND_ORIGIN` define el origen público de ese frontend en cada entorno, sin ruta, query ni fragmento. El Worker lo usa como base para los enlaces anteriores y para la imagen de marca incluida en los correos. El API valida el mismo origen para CORS, el hostname de Turnstile y las URLs de retorno de Stripe Checkout. Debe coincidir con el frontend del entorno: si se deja el valor local en Railway, los enlaces llevarán a `localhost`; si se copia un origen de Staging en Producción, los mensajes dirigirán al entorno equivocado. Valores de referencia:

| Entorno | Ejemplo de `FRONTEND_ORIGIN` | Estado en esta guía |
|---|---|---|
| Local | `http://localhost:3000` | Valor predeterminado de Compose y `.env.example`. |
| Staging | `https://<host-del-frontend-de-staging>` | Debe sustituirse por el hostname real del frontend de este repositorio y comprobarse. |
| Producción | `https://srmictlan.com` | Valor objetivo; confirmar cuando se prepare y publique el frontend de Producción. |

### Cola de correo, pedido y PDF

El API guarda el trabajo en PostgreSQL; no espera a que Resend o Mailpit termine para responder al usuario. El Worker independiente consulta la cola cada dos segundos, reclama un trabajo con bloqueo en la base y lo procesa. Por tanto, que Stripe regrese al navegador o muestre el pago no es por sí solo la condición para enviar el correo de compra: el webhook validado confirma y marca el pedido `PAID`; en la misma transacción se crea un solo trabajo de compra y se limpia el carrito.

Para ese trabajo, el Worker carga la instantánea del pedido pagado, genera en memoria un solo `detalle-pedido-<id>.pdf` y lo adjunta al mensaje. El código no guarda el PDF como archivo ni como campo de base de datos. Una caída del transporte no deshace el pago; el trabajo queda disponible para reintento en PostgreSQL.

La base evita crear otro trabajo de compra para el mismo pedido y los webhooks repetidos no vuelven a aplicar la confirmación. Además, para la API de Resend el Worker envía `purchase/<id-del-pedido>` como clave idempotente estable. Eso reduce envíos duplicados al reintentar cerca del primer intento, dentro del periodo de retención que documenta Resend. No equivale a entrega exactamente una vez: la clave del proveedor tiene retención limitada y una caída después de que el proveedor acepte el mensaje pero antes de guardar `SENT` puede requerir un reintento. El transporte SMTP local no envía esa clave al proveedor. Los correos de cuenta tampoco usan actualmente una clave idempotente de Resend.

Los fallos se persisten con estado e intentos. Se permiten hasta cinco intentos; el retraso se calcula con backoff exponencial (`2^intentos` segundos, con tope de cinco minutos). Si el proceso muere y deja un trabajo `PROCESSING`, puede reclamarse después de dos minutos; al alcanzar el límite queda `FAILED`. Un operador debe inspeccionar y decidir cómo recuperar un fallo terminal; no se debe asumir que el correo se entregó porque el pago sí quedó confirmado.

## Preparación de cuenta y dominio

1. Seleccionar la cuenta y el equipo de Resend existentes del proyecto. No crear otra cuenta ni volver a registrar el dominio hasta comprobarlo. Activar MFA y limitar el acceso administrativo.
2. Antes de habilitar uso, revisar en el panel el plan vigente, volumen permitido, límites diarios, cargos por excedentes, método de pago y alertas. Confirmar un presupuesto aprobado. No habilitar sobreconsumo ni añadir un medio de pago sin esa aprobación. Los precios y límites pueden cambiar; consultar la [página vigente de precios](https://resend.com/pricing).
3. Usar el subdominio elegido, `mail.srmictlan.com`, si el dominio continúa vigente. Resend recomienda enviar desde un subdominio; si cambió el dominio o la decisión, actualizar esta guía antes de registrar nada. Consultar la [guía oficial para añadir un dominio](https://resend.com/docs/add-a-domain).
4. En Resend, abrir **Domains → mail.srmictlan.com** y revisar su estado y pestaña **Records**. Copiar los valores exactos que muestre el panel: tipo, nombre/host, valor, TTL y prioridad cuando aplique. Si el dominio no aparece en la cuenta o Resend no lo reconoce, confirmar la cuenta/equipo correcto antes de volver a añadirlo. Esta guía no inventa valores DNS.
5. Comparar esos registros con los que ya están en Neubox/cPanel. Si coinciden y Resend lo marca verificado, no cambiar DNS. Si falta o difiere alguno, seguir la ruta concreta de Neubox/cPanel más abajo y editar sólo ese registro. Si los nameservers actuales apuntan a otro proveedor, cPanel no es autoritativo y los registros se deben revisar en el proveedor indicado por esos nameservers.
6. No crear registros desde **Child Nameservers**, no registrar glue records y no cambiar ni delegar los nameservers de la zona para verificar TXT, CNAME o MX. La verificación requiere registros en la zona DNS autoritativa actual; no una migración de DNS.
7. Esperar a que el panel de Resend marque el dominio como verificado. La propagación puede tardar; contrastar en el panel los registros publicados con los valores exactos generados y corregir sólo el registro correspondiente. No se considera verificado por haber guardado cambios en el proveedor DNS.
8. En Resend, crear una clave API con el menor alcance de envío disponible. La clave se genera en Resend y se configura como secreto del Worker de Railway en los entornos que usan Resend: primero Staging y, cuando se autorice, Producción. No se introduce en el API, cPanel ni como registro DNS. El Worker local de Compose usa SMTP hacia Mailpit y no necesita una clave Resend. Crear claves distintas por entorno; nunca incluir su valor en `.env.example`, Git, logs, tickets o mensajes, y rotarla/revocarla si se expone.
9. Configurar la identidad de remitente autorizada en ese dominio. El remitente de cuenta va en `MAIL_FROM`; el remitente de compras va en `RESEND_FROM`. Los remitentes propuestos son `Señor del Mictlán <cuentas@mail.srmictlan.com>` y `Señor del Mictlán <pedidos@mail.srmictlan.com>`, respectivamente; usarlos sólo después de que Resend acepte el dominio. La verificación de envío no crea un buzón para recibir respuestas. No asumir que cualquier dirección queda autorizada automáticamente.

### Ruta concreta: Neubox y cPanel

1. Comprueba quién sirve la zona autoritativa: revisa los nameservers del dominio en Neubox o ejecuta `dig NS srmictlan.com +short`. Si no apuntan a Neubox, no edites la copia de la zona que aparezca en cPanel; usa el DNS del proveedor autoritativo actual.
2. Si la zona está en el hosting de Neubox, abre **cPanel → Zone Editor → Manage** junto a `srmictlan.com`. La documentación de cPanel confirma que **Manage** permite añadir y editar registros DNS; consulta [Zone Editor de cPanel](https://docs.cpanel.net/cpanel/domains/zone-editor/).
3. Antes de editar, guarda una captura o exportación de los registros existentes A/AAAA, CNAME, MX, TXT (incluidos SPF, DKIM y DMARC) y verificaciones. Identifica cuáles sostienen la web y el servicio de correo actual.
4. En Resend, abre **Domains → mail.srmictlan.com → Records** y copia los campos que muestre. No se conoce ni se inventa aquí el contenido: los valores exactos deben salir de esa cuenta y de ese dominio.
5. Compara tipo, nombre/host, valor/destino, TTL y prioridad (si aplica) contra los registros actuales en cPanel. Si ya coinciden, no hagas nada. Si necesitas agregar o corregir una entrada, pulsa **Add Record** y cambia sólo ese registro. cPanel puede completar el sufijo de la zona en el nombre; revisa el nombre final antes de guardar para evitar duplicar `.srmictlan.com`.
6. No reemplaces ni borres el MX raíz del buzón existente, ni reescribas SPF/DKIM/DMARC de otros servicios. Si Resend muestra un MX, verifica el hostname completo que indica (incluido el Return-Path, si aplica); no lo sustituyas por el dominio raíz.
7. No uses en el panel de Neubox **Nameservers**, **Servidores DNS privados** ni **Registrar NameServer** para añadir TXT/CNAME/MX. Esas opciones cambian la delegación o crean child nameservers; para estos registros se usa la zona autoritativa en **Zone Editor**.
8. Guarda cada entrada, compara la tabla con la captura previa y vuelve a Resend para ejecutar **Verify**. Si falla, revisa el tipo y nombre final, valor, prioridad y propagación; corrige sólo el registro indicado. No cambies nameservers para reparar un registro individual.

Hoja para comparar los valores de Resend con la zona existente. Agrega una fila por cada entrada que muestre **Records**; esta tabla no presupone cuántos registros o tipos habrá. Los valores actuales todavía no están documentados aquí.

| # | Tipo | Nombre/host mostrado por Resend | Valor/destino | TTL | Prioridad | Nombre final en cPanel | Verificado |
|---|---|---|---|---|---|---|---|
| 1 | Pendiente del panel | Pendiente del panel | Pendiente del panel | Pendiente del panel | Si aplica | Pendiente | No |

## Variables por entorno

Configurar las variables en el servicio **Worker** de cada entorno Railway, no en la API ni en el frontend:

| Variable | Uso |
|---|---|
| `EMAIL_TRANSPORT` | `resend` en el Worker de Railway habilitado para ese entorno. |
| `RESEND_API_KEY` | Clave secreta separada por entorno; sólo se entrega al Worker. |
| `MAIL_FROM` | Remitente de confirmación, recuperación y otros mensajes de cuenta. |
| `RESEND_FROM` | Remitente de confirmación de compra con PDF. |
| `FRONTEND_ORIGIN` | Origen público del mismo entorno para enlaces de cuenta. |

Staging y Producción deben usar variables, claves, remitentes, dominios (o subdominios) y límites revisados por separado. Al preparar Staging en Fase 08, usar sólo recursos no productivos y registrar evidencia antes de habilitar envíos. Producción queda apagada hasta la Fase 10 y una autorización expresa. Nunca reutilizar claves entre entornos.

El Worker debe recibir `DATABASE_URL`, además de las variables anteriores. No colocar `RESEND_API_KEY` en el servicio API, configuración compartida de todo el proyecto, build args, imagen Docker o variables públicas. La integración hace `POST https://api.resend.com/emails` por HTTPS con `RESEND_API_KEY` en `Authorization`; no usa SMTP ni `SMTP_PASSWORD` para Resend.

En Compose local se usa `EMAIL_TRANSPORT=smtp` hacia Mailpit. La verificación de Resend con una bandeja real se realizará en Staging; no hace falta configurar una clave en el entorno local.

## Recorrido por entorno

### Local

1. El navegador local habla con el API local. El API escribe en PostgreSQL un trabajo para la confirmación de cuenta, la recuperación, el cambio de correo o la compra pagada.
2. El Worker de Compose reclama el trabajo y usa SMTP hacia Mailpit. Revisa el mensaje en `http://localhost:8025`; no aparecerá en la cuenta Gmail real del destinatario.
3. Para activación o recuperación, abre desde el navegador local el enlace a `http://localhost:3000`, y la página envía el token al API local para validarlo y consumirlo.
4. Para una compra, usa Stripe en modo de prueba y entrega el webhook de prueba al API local. Solo después de que el API valide el webhook y confirme el pedido se crea el trabajo de correo. El Worker genera el PDF en memoria y lo adjunta al mensaje visible en Mailpit.
5. Si falla el transporte, PostgreSQL conserva el trabajo para los reintentos configurados. El recorrido local permite revisar contenido, enlaces, PDF y recuperación del trabajo; por usar Mailpit no prueba autenticación DNS ni entrega externa.

### Staging

El recorrido previsto para el repositorio actual separa los servicios frontend, API y Worker, y conecta API y Worker a la base PostgreSQL del mismo entorno. Configura `FRONTEND_ORIGIN` en API y Worker con el hostname exacto de este frontend de Staging. En el Worker se selecciona `EMAIL_TRANSPORT=resend` y se ponen, como secretos/variables del servicio, una clave exclusiva de Staging, `MAIL_FROM`, `RESEND_FROM` y `DATABASE_URL`. El API recibe su configuración de aplicación y base de datos, pero no `RESEND_API_KEY`.

Con esa configuración, registro, recuperación y cambio de correo generan trabajo y el Worker envía enlaces que regresan al frontend de Staging. Para compras, usa Stripe de prueba; el webhook recibido por el API confirma el pago, persiste el único trabajo, y el Worker genera y adjunta el PDF a la solicitud HTTPS de Resend. Resend intenta entregarlo a una dirección controlada y válida, por ejemplo `juan+prueba@gmail.com`. Revisa tanto el mensaje/estado en Resend como el mensaje recibido, que el enlace abra Staging, que exista un PDF adjunto legible, los reintentos ante un fallo controlado y la idempotencia ante la repetición del webhook.

Esta guía describe la configuración que debe probarse; no afirma que Staging del repositorio actual ya esté desplegado ni que el envío real haya pasado esa prueba. No uses una clave de Producción ni remitentes o recursos productivos en esta validación.

### Producción

El mismo flujo se habilita cuando el entorno de Producción esté preparado y aprobado: `FRONTEND_ORIGIN=https://srmictlan.com`, `EMAIL_TRANSPORT=resend`, clave de Producción separada de la de Staging, remitentes autorizados bajo `mail.srmictlan.com`, y API/Worker conectados a la base de Producción. La clave vive solamente como secreto del Worker. La API persiste los trabajos; el Worker genera los enlaces o el PDF y entrega los mensajes a Resend por HTTPS. Los enlaces deben regresar al sitio público y la imagen de marca del correo debe cargar desde el mismo origen.

Un pedido solo produce confirmación después de que el API acepta el webhook de pago y guarda `PAID`; el PDF se genera en memoria, se adjunta al correo y no se almacena en PostgreSQL. Los mismos reintentos e idempotencia aplican, pero los mensajes se dirigen a destinatarios reales. Hasta que se autorice esa activación, la integración de Producción permanece apagada; una prueba de Staging no sustituye la verificación de variables, claves, DNS, remitentes, destinatarios y límites de Producción.

### Estado: código, configuración y comprobación

| Categoría | Estado conocido |
|---|---|
| Implementado en el código | Transportes SMTP y Resend HTTPS; cola PostgreSQL procesada por Worker; mensajes de cuenta y compra; tokens de un solo uso; PDF de compra generado en memoria; reintentos acotados; protección contra trabajos de compra duplicados y clave idempotente para Resend. Hay pruebas unitarias y una prueba de integración con PostgreSQL/Mailpit en el repositorio. |
| Configurado en local | `compose.yaml` fija SMTP → Mailpit; `.env.example` define `FRONTEND_ORIGIN=http://localhost:3000` y remitentes locales de ejemplo. No requiere clave Resend ni envía a bandejas externas. |
| Configuración externa reportada | Esta guía registra que el responsable cargó registros en Neubox/cPanel y que el panel de Resend mostró `mail.srmictlan.com` verificado el 16 de noviembre de 2026. Los valores no están guardados aquí y el estado no se volvió a consultar durante esta actualización. |
| Pendiente de verificar | Que Neubox/cPanel siga siendo autoritativo y que la zona coincida con **Domains → Records**; que la clave correcta esté instalada en el Worker del repositorio actual; que los remitentes estén aceptados; el despliegue y recorrido Resend→bandeja en Staging, incluida compra, PDF, enlaces y reintentos; y la configuración separada de Producción. |

La existencia de una clave en una cuenta de Resend o su uso por otro servicio no demuestra que el Worker de este repositorio la tenga configurada ni que este recorrido haya sido probado. Esta distinción debe mantenerse al registrar evidencia de cada entorno.

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
