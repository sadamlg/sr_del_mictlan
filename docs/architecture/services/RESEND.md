# Resend · correo transaccional

## Estado

La integración de código está preparada. El responsable confirma que los registros DNS de Resend del sistema legado ya se cargaron en Neubox/cPanel. En esta fase no se comprobó en el panel de Resend que sigan vigentes ni que el dominio aparezca verificado; tampoco se copiaron esos valores al repositorio. No volver a crear registros antes de comparar la zona actual con **Domains → Records**.

La documentación del proyecto legado fija `srmictlan.com` y eligió `mail.srmictlan.com` para envío. Esta guía retoma esa decisión. Antes de aplicar cambios, confirma que el dominio sigue bajo control del proyecto y que la zona DNS autoritativa sigue en Neubox/cPanel; el legado no conserva los valores DNS generados por la cuenta de Resend.

La tienda no necesita estar publicada para verificar este subdominio. Hace falta controlar el dominio y poder editar su zona DNS autoritativa; por eso la configuración puede hacerse antes de que el hostname web apunte a la tienda.

La fase 07 usa Resend por HTTPS desde el servicio Worker. La API no necesita ni recibe `RESEND_API_KEY`. En Compose se selecciona SMTP hacia Mailpit; `RESEND_API_KEY` no se configura en Compose.

## Preparación de cuenta y dominio

1. Seleccionar la cuenta y el equipo de Resend existentes del sistema legado, si siguen siendo los del proyecto. No crear otra cuenta ni volver a registrar el dominio hasta comprobarlo. Activar MFA y limitar el acceso administrativo.
2. Antes de habilitar uso, revisar en el panel el plan vigente, volumen permitido, límites diarios, cargos por excedentes, método de pago y alertas. Confirmar un presupuesto aprobado. No habilitar sobreconsumo ni añadir un medio de pago sin esa aprobación. Los precios y límites pueden cambiar; consultar la [página vigente de precios](https://resend.com/pricing).
3. Usar el subdominio ya elegido en el legado, `mail.srmictlan.com`, si el dominio continúa vigente. Resend recomienda enviar desde un subdominio; si cambió el dominio o la decisión, actualizar esta guía antes de registrar nada. Consultar la [guía oficial para añadir un dominio](https://resend.com/docs/add-a-domain).
4. En Resend, abrir **Domains → mail.srmictlan.com** y revisar su estado y pestaña **Records**. Copiar los valores exactos que muestre el panel: tipo, nombre/host, valor, TTL y prioridad cuando aplique. Si el dominio no aparece en la cuenta o Resend no lo reconoce, confirmar la cuenta/equipo correcto antes de volver a añadirlo. Esta guía no inventa valores DNS.
5. Comparar esos registros con los que ya están en Neubox/cPanel. Si coinciden y Resend lo marca verificado, no cambiar DNS. Si falta o difiere alguno, seguir la ruta concreta de Neubox/cPanel más abajo y editar sólo ese registro. Si los nameservers actuales apuntan a otro proveedor, cPanel no es autoritativo y los registros se deben revisar en el proveedor indicado por esos nameservers.
6. No crear registros desde **Child Nameservers**, no registrar glue records y no cambiar ni delegar los nameservers de la zona para verificar TXT, CNAME o MX. La verificación requiere registros en la zona DNS autoritativa actual; no una migración de DNS.
7. Esperar a que el panel de Resend marque el dominio como verificado. La propagación puede tardar; contrastar en el panel los registros publicados con los valores exactos generados y corregir sólo el registro correspondiente. No se considera verificado por haber guardado cambios en el proveedor DNS.
8. En Resend, crear una clave API con el menor alcance de envío disponible. La clave se genera en Resend y se guarda como secreto del Worker de Railway o del Worker local optativo; no se introduce en cPanel ni como registro DNS. Crear claves distintas por entorno, nunca incluir su valor en `.env.example`, Git, logs, tickets o mensajes, y rotarla/revocarla si se expone.
9. Configurar la identidad de remitente autorizada en ese dominio. El remitente de cuenta va en `MAIL_FROM`; el remitente de compras va en `RESEND_FROM`. El legado propone `Señor del Mictlán <cuentas@mail.srmictlan.com>` y `Señor del Mictlán <pedidos@mail.srmictlan.com>`, respectivamente; usarlos sólo después de que Resend acepte el dominio. La verificación de envío no crea un buzón para recibir respuestas. No asumir que cualquier dirección queda autorizada automáticamente.

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
| `EMAIL_TRANSPORT` | `resend` únicamente en el Worker de Railway habilitado para ese entorno. |
| `RESEND_API_KEY` | Clave secreta de envío de ese entorno; sólo el Worker. |
| `MAIL_FROM` | Remitente de confirmación, recuperación y otros mensajes de cuenta. |
| `RESEND_FROM` | Remitente de confirmación de compra con PDF. |
| `FRONTEND_ORIGIN` | Origen público del mismo entorno para enlaces de cuenta. |

Staging y Producción deben usar variables, claves, remitentes, dominios (o subdominios) y límites revisados por separado. Al preparar Staging en Fase 08, usar sólo recursos no productivos y registrar evidencia antes de habilitar envíos. Producción queda apagada hasta la Fase 10 y una autorización expresa. Nunca reutilizar claves entre entornos.

El Worker debe recibir `DATABASE_URL`, además de las variables anteriores. No colocar `RESEND_API_KEY` en el servicio API, configuración compartida de todo el proyecto, build args, imagen Docker o variables públicas. La integración hace `POST https://api.resend.com/emails` por HTTPS con `RESEND_API_KEY` en `Authorization`; no usa SMTP ni `SMTP_PASSWORD` para Resend.

En Compose local, mantener `EMAIL_TRANSPORT=smtp`, `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `MAIL_FROM` y `RESEND_FROM` locales. No definir una clave Resend para probar localmente. Mailpit es el destino local capturable; no es una prueba de aceptación de cuenta ni de DNS de Resend.

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
