# Neubox: registro del dominio y delegación DNS

Neubox conserva el registro, la titularidad, la renovación y la configuración de nameservers del dominio. Cloudflare administra la zona DNS pública cuando los nameservers delegados en Neubox son los asignados por Cloudflare. Railway hospeda la aplicación; que el dominio esté en Neubox no implica que la web corra allí.

## Perfil por entorno

| Entorno | Uso del dominio |
|---|---|
| Local | `localhost`; no usa el dominio público |
| Staging | Preferir hostname generado por Railway o subdominio no productivo separado |
| Production | El dominio aprobado y su alias `www`, conectados al frontend productivo |

No conectes el dominio público de Production a Staging. Si se requiere probar con un dominio propio, usa un subdominio dedicado y mantén separados los registros y credenciales.

## Revisar el registro y el DNS autoritativo

1. En Neubox, confirmar titularidad, acceso a la cuenta, correo de recuperación, fecha/renovación y nameservers actuales.
2. Consultar los NS delegados públicamente (por ejemplo, `dig NS ejemplo.com +short`) y compararlos con los nameservers asignados en la cuenta DNS elegida.
3. Si Cloudflare es autoritativo, editar la zona sólo en Cloudflare. No crear en Neubox/cPanel cambios paralelos esperando que se publiquen.
4. Antes de modificar registros, guardar inventario de A/AAAA, CNAME, MX, SPF, DKIM, DMARC, verificaciones de Resend y demás servicios. El cambio de nameservers mueve la autoridad de toda la zona, no sólo la web.
5. Renovar el dominio en Neubox y mantener al menos un método de pago y contacto recuperables. La renovación del dominio y el servicio DNS son responsabilidades distintas.

Una zona DNS puede incluir web, medios, correo y verificaciones. Conserva los registros MX y de autenticación que ya funcionen al conectar Railway o añadir dominios de R2. Consulta [Cloudflare](CLOUDFLARE.md), [Resend](RESEND.md) y [Railway](RAILWAY.md) antes de editar registros.

## Aplicar cambios durante Producción

Railway entrega los valores CNAME/TXT para el hostname y el servicio que conectamos; Resend entrega sus propios registros de verificación. Cópialos en la zona autoritativa confirmada y verifica nombre completo, tipo y valor. Usa sólo valores del entorno que configuras y conserva las entradas de correo al conectar un hostname web.

No se debe editar ni delegar el dominio desde esta guía. Las operaciones de cuenta, DNS y renovación ocurren en el proveedor y requieren una ventana de implementación aprobada.

## Rendimiento, seguridad y costos

- **Rendimiento y disponibilidad:** el registrador no hospeda la aplicación cuando Railway sirve el sitio. DNS responde con la delegación y TTL configurados; cambiar nameservers puede tardar en propagarse. No uses DNS del registrador como sustituto de CDN, TLS u hospedaje.
- **Seguridad:** protege la cuenta de Neubox con autenticación multifactor y recuperación actualizada cuando esté disponible; habilita bloqueo de transferencia si el plan lo ofrece. Limita quién puede cambiar titularidad, renovación o nameservers y conserva un método de recuperación fuera del correo del dominio.
- **Costos:** confirma renovación del dominio, impuestos y cargos de privacidad/servicios adicionales en el panel y la [página vigente de precios de Neubox](https://neubox.com/). La renovación del dominio no incluye necesariamente hosting, DNS avanzado ni productos de Cloudflare.

## Referencias

- [Nameservers de Cloudflare](https://developers.cloudflare.com/dns/nameservers/update-nameservers/)
- [Editar registros DNS en Cloudflare](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)
- [Zone Editor de cPanel](https://docs.cpanel.net/cpanel/domains/zone-editor/96/)
