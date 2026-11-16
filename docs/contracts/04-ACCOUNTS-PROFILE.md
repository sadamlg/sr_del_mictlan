# Contrato de cuentas y perfil

**Estado:** contrato de implementación de la fase 04. Describe el resultado esperado y los criterios verificables; su presencia no acredita que el código o los servicios estén implementados. El alcance maestro se mantiene en [MVP_SCOPE.md](../MVP_SCOPE.md), las rutas transversales en [RUTAS Y ACCESO](../architecture/ROUTES-AND-ACCESS.md) y los estilos aprobados en [DESIGN.md](../DESIGN.md).

## Objetivo y límites

Permitir que una persona adulta cree y confirme su cuenta, inicie y cierre sesión, la restaure al volver al sitio, recupere o cambie su contraseña y edite su perfil. Las páginas deben ofrecer los estados de carga, éxito, validación, error, enlace vencido o usado y sesión ausente o vencida.

La fase incluye la entrega de correo de cuenta desde el worker local a Mailpit, la protección Turnstile en registro e inicio de sesión y la integración visual con la landing y el encabezado. No incorpora carritos, checkout funcional, pedidos, pagos, un proveedor externo de correo, Staging ni Producción. **Mis pedidos** consulta sólo datos reales y responde vacío mientras aún no existan pedidos.

## Datos y validación

- El registro solicita `firstName`, `lastName`, `email`, `dateOfBirth`, `password` y domicilio mexicano: `street`, `number`, `neighborhood`, `locality`, `state`, `postalCode`.
- Nombres, apellidos y campos de domicilio se recortan y normalizan como texto, son obligatorios y tienen máximo de 120 caracteres. El correo se recorta, normaliza a minúsculas, valida y limita a 254 caracteres. Se rechazan campos adicionales.
- La fecha usa formato `YYYY-MM-DD`, debe ser una fecha de calendario real, no futura y acreditar 18 años cumplidos en la fecha actual. Se vuelve a validar al editarla.
- El código postal es una cadena de exactamente cinco dígitos. No se consulta un servicio externo de direcciones.
- La captura visual de fecha usa `DD/MM/AAAA` para el formato mexicano y la interfaz la convierte a `YYYY-MM-DD` antes de llamar al API.
- La contraseña admite de 12 a 128 caracteres. Nunca se almacena ni responde en claro; se usa scrypt con sal aleatoria. El API y los logs nunca devuelven ni registran contraseñas o hashes.
- La cuenta queda pendiente y sin sesión hasta consumir la confirmación. Un correo pendiente no puede iniciar sesión ni acceder al perfil.
- Cambiar el correo exige la contraseña actual. El correo vigente no cambia hasta confirmar el nuevo destino; se reserva el correo pendiente para impedir duplicados.

## Enlaces, correo y sesión

- Los enlaces de alta y cambio de correo vencen a las 24 horas; los de recuperación vencen a los 30 minutos. Cada token contiene 32 bytes aleatorios codificados en base64url; PostgreSQL conserva únicamente SHA-256, propósito, vencimiento y consumo. Un token se consume una sola vez. Reemplazarlo invalida los anteriores del mismo propósito.
- La confirmación del registro activa la cuenta e inicia sesión. La confirmación de un cambio de correo conserva la sesión existente. Un token vencido, inválido o consumido muestra un estado de enlace vencido/inválido y permite volver a solicitar recuperación cuando aplique.
- Cuando el alta viene de una intención de checkout, la cola conserva únicamente la bandera booleana de continuación y el enlace dirige a una ruta local fija con `continuar=checkout`. No se acepta una URL de retorno arbitraria ni se implementa carrito o pago en esta fase.
- La recuperación responde `202` con el mismo mensaje tanto si el correo existe como si no. Restablecer contraseña invalida el token usado, los otros tokens de recuperación y todas las sesiones de la cuenta. Cambiar la contraseña autenticado exige verificar la actual y rota las demás sesiones conservando la sesión actual.
- La sesión usa un identificador aleatorio opaco de 32 bytes; se guarda en PostgreSQL sólo su hash SHA-256. La cookie `mictlan_session` tiene `HttpOnly`, `SameSite=Lax`, `Path=/`, duración de siete días y `Secure` bajo HTTPS. La identidad de las operaciones privadas deriva exclusivamente de la cookie validada.
- El worker reclama correo desde una cola persistida en PostgreSQL, procesa confirmación, cambio de correo y recuperación, y envía por SMTP a Mailpit en Compose. No se guardan tokens en claro dentro del trabajo ni se usa un broker adicional. Los errores de correo no incluyen direcciones, domicilios, tokens ni contenido personal.
- Esta fase no integra Resend. Su configuración, límites y dominio de envío corresponden a la fase 07; las llaves y hostnames reales de Turnstile se verifican en Staging durante la fase 08 y se preparan para Producción en la fase 10.

## Turnstile

- Registro e inicio de sesión requieren `turnstileToken`. La API llama a Siteverify por HTTPS antes de procesar la operación. Un token ausente o inválido responde `403`; si falta la configuración o Siteverify no responde, se falla cerrado con `503`.
- Los tokens tienen un máximo de 2.048 caracteres, se usan en una sola solicitud y nunca se pasan al servicio de cuentas ni se escriben en logs. El navegador renueva el reto tras cada envío, incluso si falla la validación de cuenta.
- Desarrollo local usa exclusivamente las llaves de prueba oficiales de Cloudflare: sitekey `1x00000000000000000000AA` y secret `1x0000000000000000000000000000000AA`, declaradas como valores ilustrativos en `.env.example` y configurables en `.env`. No se inventan ni se solicitan credenciales reales.
- Cloudflare indica que una verificación exitosa con la llave de prueba devuelve `hostname: example.com` y no incluye `action`; por eso el entorno local no puede exigir esos valores. Con llaves reales, la API debe exigir que host y acción correspondan a `FRONTEND_ORIGIN` y a `account_register` o `account_login`. Nunca se aceptan llaves de prueba como evidencia de Staging o Producción. Fuente: [pruebas de Turnstile](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## Rutas de página

| Ruta | Acceso | Comportamiento observable |
|---|---|---|
| `/cuenta/registro` | Público | Formulario de datos personales y domicilio; tras registro confirma que debe revisar el correo. Acepta `?continuar=checkout`. |
| `/cuenta/iniciar-sesion` | Público | Correo, contraseña, Turnstile y enlace de recuperación; conserva `?continuar=checkout`. |
| `/cuenta/recuperar-contrasena` | Público | Solicita recuperación y siempre muestra confirmación genérica. |
| `/cuenta/restablecer-contrasena?token=…` | Enlace | Permite establecer nueva contraseña; muestra expiración o uso previo sin revelar la cuenta. |
| `/cuenta/confirmar-correo?token=…` | Enlace | Confirma correo, crea sesión para cuenta nueva y continúa a tienda o a la ruta local de continuación según la bandera segura. |
| `/cuenta` | Sesión opcional | Con sesión muestra perfil editable; sin sesión ofrece iniciar sesión. |
| `/cuenta/seguridad` | Sesión opcional | Con sesión permite cambio autenticado de contraseña; sin sesión ofrece acceso. |
| `/cuenta/pedidos` | Sesión opcional | Con sesión muestra pedidos reales o estado vacío; nunca muestra órdenes de ejemplo. |

El encabezado enlaza a registro/inicio cuando no hay sesión. Con sesión muestra el saludo por nombre y el menú con **Mi cuenta**, **Mis pedidos** y **Cerrar sesión** en escritorio y móvil. El nombre, el estado de sesión y los avisos no se guardan en almacenamiento web como credenciales.

## API de cuenta

Las rutas devuelven JSON con `Cache-Control: no-store`; los errores usan `{ "error": { "code", "message", "fields?" } }`. Códigos esperados: `401` para sesión ausente o vencida, `403` para Turnstile o cuenta aún no confirmada, `409` para correo ocupado, `422` para entradas inválidas y `429` para límite excedido. El backend nunca acepta un identificador de cuenta enviado por el navegador para elegir al titular.

| Método y ruta | Acceso | Resultado |
|---|---|---|
| `POST /api/auth/register` | Público + Turnstile | Crea cuenta pendiente y encola confirmación; no crea sesión. |
| `POST /api/auth/login` | Público + Turnstile | Verifica credenciales y crea cookie sólo para cuenta confirmada. |
| `GET /api/auth/session` | Cookie opcional | Devuelve cuenta pública o `401`. |
| `POST /api/auth/logout` | Cookie opcional | Revoca sesión actual y borra cookie; operación repetible. |
| `POST /api/auth/password-reset-requests` | Público | Encola recuperación cuando aplica y responde con texto genérico `202`. |
| `POST /api/auth/password-reset-validations` | Token | Devuelve sólo `{ "valid": true/false }` para indicar si el enlace de recuperación sigue vigente y sin consumir. |
| `POST /api/auth/password-resets` | Token | Consume el token y cambia contraseña, revocando sesiones. |
| `POST /api/auth/email-confirmations` | Token | Confirma alta o cambio de correo; en alta devuelve cookie de sesión. |
| `GET /api/profile`, `PATCH /api/profile` | Privado | Lee o actualiza datos del titular; cambio de correo requiere contraseña. |
| `PATCH /api/profile/password` | Privado | Cambia la contraseña, rota las demás sesiones y conserva la actual. |
| `GET /api/orders` | Privado | Devuelve pedidos pagados reales del titular; mientras no existan responde `{ "orders": [] }`. |

Las escrituras de cuenta limitan solicitudes por IP y ruta a 30 por 15 minutos por proceso. La IP se obtiene de la conexión o de proxies expresamente confiables; no se confía en un `X-Real-IP` aportado libremente por el cliente. CORS, si se requiere en desarrollo, admite sólo `FRONTEND_ORIGIN` y credenciales; nunca usa `*`. Las páginas privadas y respuestas de sesión no se almacenan en caché pública.

## Presentación y accesibilidad

- Se conserva la dirección visual de [DESIGN.md](../DESIGN.md): fondo oscuro editorial, encabezados Cinzel Decorative, texto Open Sans/Montserrat, acento verde agua, estados rojos y componentes de cuenta existentes en el sistema visual. Tailwind CSS 4 y Lucide React son la base; los formularios se agrupan por responsabilidad.
- Los campos tienen etiqueta visible, `autocomplete` apropiado, foco perceptible, errores asociados al campo y un resumen de error anunciable. Las validaciones del navegador no sustituyen las del servidor; los formularios personalizados no muestran avisos nativos inconsistentes.
- Contraseña de alta y nueva contraseña permiten mostrar/ocultar mediante botón accesible. Los formularios presentan estado ocupado, éxito, validación por campo, error recuperable y bloqueo cuando Turnstile no está listo. La fecha puede capturarse con teclado y mostrar formato local comprensible.
- Al cambiar entre vistas de cuenta o volver con el historial del navegador, se limpian los errores y avisos transitorios, los tokens de Turnstile y los datos no guardados; el perfil vuelve a los últimos datos guardados. Tras un intento al servidor se descartan las contraseñas. Un login fallido conserva el correo para facilitar la corrección, pero no la contraseña; los errores locales permanecen mientras se corrige el formulario y se quitan al editar el campo correspondiente.
- El perfil sólo habilita guardar cuando hay cambios. El aviso de éxito tras guardar desaparece temporalmente; el aviso del cambio de correo pendiente persiste hasta confirmar. La expiración de sesión devuelve a una pantalla de acceso comprensible y conserva sólo el destino local permitido.
- **Mis pedidos** tiene estados de carga, error, sesión vencida y vacío. El vacío no fabrica datos, importes, fechas ni productos.
- Las vistas se validan a 320, 768, 1024 y 1440 px, en teclado y con lector de pantalla; el cierre no se condiciona a emular movimiento reducido.

## Criterios observables de cierre

| ID | Comprobación observable |
|---|---|
| AC-01 | Un registro válido crea una cuenta pendiente, no entrega cookie de sesión y produce un correo capturable en Mailpit. |
| AC-02 | Datos inválidos, fecha menor de 18 años, fecha futura o imposible, domicilio incompleto, CP distinto de cinco dígitos, correo mal formado y campos inesperados se rechazan en cliente y servidor. |
| AC-03 | Una cuenta pendiente no puede iniciar sesión. Confirmar un token vigente activa la cuenta, consume el token e inicia sesión; repetirlo o dejarlo vencer da estado de error/expiración y no crea otra sesión. |
| AC-04 | La sesión sobrevive navegación y recarga, y cierre o expiración elimina el acceso a rutas privadas. La cookie es `HttpOnly`, acotada y no contiene PII. |
| AC-05 | Recuperación devuelve el mismo mensaje con correo registrado o no registrado. El enlace dura 30 minutos, se usa una vez, cambia el hash de contraseña e invalida las sesiones previas. |
| AC-06 | Cambio autenticado verifica la contraseña actual, cambia contraseña y cierra otras sesiones; correo nuevo permanece pendiente hasta confirmarlo y entonces cambia sin cerrar la sesión actual. |
| AC-07 | El perfil refleja datos editados y exige fecha adulta y CP válido. Guardar sin cambios está desactivado y el error de conflicto por correo se presenta en contexto. |
| AC-08 | Turnstile sin token o con token inválido no crea sesión ni cuenta. Siteverify caído o sin clave falla cerrado; la UI permite recuperar el widget y nunca registra token. |
| AC-09 | Registro desde checkout conserva sólo `continuar=checkout`, confirma identidad y vuelve a una ruta local fija; no crea carrito, pago ni pedidos. |
| AC-10 | **Mis pedidos** muestra vacío con cero pedidos, y los enlaces de cuenta funcionan en encabezado de escritorio y menú móvil. |
| AC-11 | Pruebas `node:test`, lint, build, validación/generación/migraciones Prisma y recorridos disponibles de Compose pasan; el navegador no presenta errores de consola, foco perdido ni desbordamiento móvil. |
| AC-12 | La evidencia de cierre anota fecha, entorno, commit, comandos y resultados comprobados; cualquier verificación bloqueada se marca pendiente con causa concreta. |
| AC-13 | Al salir de una vista de cuenta y regresar por navegación o historial no reaparecen errores ni datos transitorios obsoletos. Los secretos se limpian tras cada intento al servidor, el perfil descarta ediciones no guardadas al salir y los errores de campo se conservan sólo hasta corregirlos. |

## Plan de equivalencia práctica

1. Comparar las páginas de alta, inicio, recuperación, seguridad, perfil, pedidos y confirmación en escritorio y móvil: campos, títulos, orden, enlaces, estructura y estilos del sistema aprobado.
2. Comparar recorridos completos y sus bifurcaciones: cuenta pendiente, token válido/vencido/reutilizado, login válido/inválido, cookie persistida/revocada, perfil guardado/idéntico, cambio de correo pendiente/confirmado y recuperación genérica.
3. Comprobar el widget y Siteverify con el par oficial de prueba local; ensayar `success`, rechazo, duplicado y caída mediante pruebas deterministas. Validar host y acción sólo cuando se utilicen llaves reales.
4. Verificar correo, sesión y tokens contra PostgreSQL/Mailpit; comprobar que la base guarda hashes, que los logs/respuestas omiten secretos y que el worker reintenta fallos sin crear trabajos externos.
5. Navegar y probar teclado/foco, tamaños móvil/escritorio, consola y solicitudes de red. Aceptar diferencias sólo cuando sean necesarias para respetar las fases, arquitectura o seguridad actuales y queden anotadas aquí.
