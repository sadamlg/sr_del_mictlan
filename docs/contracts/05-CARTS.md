# Contrato 05: Carritos

**Estado:** cerrado para implementación — 15 de noviembre de 2026.
**Base de implementación:** `60b0e14dd0d5510e5042258cbbcf82c129dc38b6` (`develop`, con el cierre de Fase 04 y la corrección LAN integrados).
**Referencia de interfaz:** los criterios visuales y de comportamiento descritos en este contrato.

## Objetivo

Permitir preparar un carrito como invitado o con cuenta, conservar el carrito de invitado en el mismo navegador durante 30 días desde su última actividad y sumar sus cantidades al carrito de cuenta de forma idempotente al iniciar sesión o registrarse.

El carrito es un panel lateral integrado con la tienda. No crea una ruta independiente ni modifica las pantallas o rutas aprobadas en la fase 04. La acción para seguir navegando conserva el acceso a la colección.

## Alcance y límites

- Incluye almacenamiento local del carrito de invitado, persistencia del carrito de cuenta en PostgreSQL, transferencia idempotente, precios actuales del catálogo, edición y eliminación de cantidades, disponibilidad y estados de error.
- El máximo es 99 unidades por producto. El backend vuelve a comprobar producto activo y precio válido en cada escritura de cuenta.
- Un producto inactivo o con precio inválido se conserva para que la persona pueda quitarlo; no permite aumentar unidades ni iniciar una compra.
- No se reservan ni verifican existencias.
- Esta fase no incluye Checkout, Stripe, webhooks, órdenes, correos de compra ni cambios al flujo de **Mis pedidos**. Los botones del carrito no enlazan a pago ni agregan `continuar=checkout` a las rutas de cuenta.
- La cuenta, la sesión y sus rutas existentes siguen siendo responsabilidad de la fase 04; el carrito consume la sesión compartida y no crea otra autenticación.

## Estado inicial y disponibilidad del botón — integración de fase 08

El botón de producto empieza deshabilitado con “Cargando carrito…” tanto en el HTML del servidor como en la primera hidratación del cliente. Hasta completar esa hidratación no usa estados del proveedor que puedan haber cambiado mientras se transmitía el catálogo. Esto evita diferencias de texto y nombre accesible entre servidor y cliente.

Después de hidratar, la consulta de configuración muestra “Consultando…”; si Checkout está apagado muestra “Próximamente”, y si la consulta falla muestra “No disponible”. Con Checkout habilitado, la restauración o actualización del carrito muestra “Cargando carrito…” y el límite de 99 unidades muestra “Límite alcanzado”. Sólo el estado disponible muestra “Agregar al carrito” y permite pulsarlo. Este control de fase 08 complementa el bloqueo de Checkout de la API; no impide acceder al resumen.

## Referencia visual

La interfaz reutiliza los tokens de [DESIGN.md](../DESIGN.md): carbón para el panel, marfil y salvia para el texto, verde agua para acciones y foco, dorado para importes y rojo para errores o productos no disponibles. Usa Cinzel Decorative para títulos y Montserrat para etiquetas y controles. Los iconos son de Lucide React.

| Elemento | Criterio de presentación y comportamiento |
|---|---|
| Encabezado | El botón de canasta permanece en el encabezado existente. Su nombre accesible comunica el total de unidades; el contador se actualiza al cambiar cantidades y usa texto legible. En móvil, el botón cambia a una X para cerrar el panel. |
| Escritorio | Desde el breakpoint `lg`, abre un `<dialog>` modal nativo de ancho `100%` hasta `32rem`, pegado al borde derecho y con altura de viewport. El fondo oscurece el resto de la página. Abrir enfoca el botón de cierre; Escape o fondo cierran y devuelven foco a la canasta. Respeta movimiento reducido. |
| Móvil | Entra desde el borde derecho, ocupa `90vw` hasta `32rem` y comienza a 120 px del borde superior, debajo del encabezado. El fondo cubre la zona inferior al encabezado. El botón del encabezado cierra el panel. Se bloquea el desplazamiento del documento mientras está abierto y Escape/fondo cierran con retorno de foco. Menú y carrito comparten un estado excluyente. |
| Cabecera del panel | Muestra “Tu carrito” y el total de unidades con singular o plural. Incluye botón de cierre en escritorio; en móvil se cierra desde el encabezado. |
| Carrito vacío | Mantiene el cuerpo centrado con “El carrito está vacío” y un pie fijo con acción “Seguir comprando” que cierra el panel y lleva a `/#coleccion`. |
| Línea de producto | Muestra imagen del catálogo o un marcador con inicial, nombre, descriptor separado por ` · `, total de línea en MXN y control de cantidad. La imagen lleva un fondo oscuro y borde fino. Las líneas tienen espacio entre sí sin divisores. El nombre y descriptor quedan a la izquierda; el precio arriba a la derecha y los controles debajo. El nombre largo se ajusta sin desbordar; imagen y tipografía se adaptan al ancho móvil. |
| Controles de cantidad | La cantidad se muestra entre controles accesibles de disminuir y aumentar; a cantidad 1, el control de disminuir se reemplaza por quitar. El icono de papelera también permite quitar líneas con más de una unidad. A 99, aumentar queda deshabilitado. Controles ocupados o productos no disponibles quedan deshabilitados. |
| Disponibilidad | Una línea no disponible informa “Este producto ya no está disponible.”, oculta el importe que ya no puede confirmarse y permite quitarla. En el carrito de cuenta, el pie avisa “Quita los productos no disponibles para continuar.” |
| Pie con productos | Permanece fijo y muestra subtotal recalculado en MXN. Para invitado ofrece “Inicia sesión para pagar” hacia `/cuenta/iniciar-sesion`, sin `continuar=checkout`; para una cuenta ofrece “Seguir comprando”, que cierra el panel y lleva a la colección. No muestra precio histórico ni inicia un cobro. |
| Carga y error | Durante la restauración de sesión se muestra el estado de consulta y se deshabilitan las acciones. Los errores se anuncian con `role="alert"`; una falla al cargar ofrece reintento. Un conflicto al fusionar preserva el carrito local y permite quitar la línea inválida y volver a intentar. |

El panel debe conservar su jerarquía, proporciones, tipografía, espaciado, controles y comportamiento de foco. Se revisarán escritorio y móvil con carritos vacío y con productos, incluida la presentación de errores; la verificación visual completa es condición de cierre.

## Persistencia y API

- El navegador guarda sólo `{ slug, quantity }` por línea y `lastActivityAt`; descarta registros malformados o vencidos. Si el almacenamiento del navegador no está disponible, el carrito sigue funcionando en memoria.
- Cada cambio de invitado renueva la expiración de 30 días y sincroniza otras pestañas con el evento `storage`.
- El carrito de cuenta contiene una línea por producto y su cantidad. La respuesta une cada slug con el producto vigente y calcula precio de línea y subtotal en el servidor. La interfaz no acepta un precio enviado por el navegador.
- La API bajo `/api/cart/account` exige la sesión existente. La identidad se deriva de la cookie de sesión; el cliente no envía identificadores de cuenta.
- `GET /api/cart/account` consulta el carrito de cuenta.
- `PUT /api/cart/account/items` crea o reemplaza cantidad; `DELETE /api/cart/account/items/:slug` elimina la línea.
- `POST /api/cart/account/merge` acepta exactamente un `transferId` UUID y una lista de `{ slug, quantity }`. Repetir el mismo `transferId` para la cuenta no suma cantidades de nuevo. El cambio se confirma de forma transaccional; un producto inválido no deja una fusión parcial.
- Si la sesión restaurada es de cuenta y hay líneas locales, se envía la transferencia idempotente. Si no hay líneas locales, se obtiene el carrito de cuenta. Los cambios locales hechos mientras la transferencia está en curso se conservan para un nuevo intento.
- Si un producto se desactiva durante la transferencia, el error conserva las líneas locales y permite quitar la línea no disponible.
- Un conflicto `PRODUCT_NOT_AVAILABLE` identifica en `error.fields.unavailableSlugs` las líneas no disponibles para deshabilitar su aumento y ocultar sus importes sin afectar las demás.

## Criterios de aceptación

| ID | Criterio |
|---|---|
| C05-01 | Un invitado puede añadir un producto activo desde su tarjeta; el panel se abre, el contador y las líneas coinciden y el subtotal usa el precio vigente en MXN. |
| C05-02 | Cambiar cantidad, quitar una línea y continuar navegando actualizan la vista y persisten el carrito local dentro del mismo navegador. |
| C05-03 | Un carrito local válido se restaura tras recargar y vence 30 días después de la última actividad; datos inválidos o vencidos se descartan. |
| C05-04 | Con sesión de cuenta, las lecturas y escrituras usan la API autenticada; ninguna identidad, cookie o precio se acepta desde el cuerpo del cliente. |
| C05-05 | Tras iniciar sesión o confirmar registro, las cantidades locales se suman al carrito de cuenta una sola vez; reintentar no duplica la transferencia. |
| C05-06 | Un error de sesión, red o fusión se presenta en la interfaz sin perder las líneas locales; hay reintento cuando aplica. |
| C05-07 | Ninguna línea supera 99; productos inactivos o precios inválidos no se agregan ni aumentan, y se pueden quitar. |
| C05-08 | Escritorio y móvil conservan la distribución y los controles descritos, el carrito y el menú móvil no se abren a la vez, Escape cierra, el foco vuelve al encabezado y el panel no produce desbordamiento horizontal. |
| C05-09 | No se agrega Checkout, Stripe, webhooks, órdenes, correo de compra ni cambios de contenido o rutas de la fase 04. |
| C05-10 | La revisión visual final cubre escritorio y móvil con carrito vacío y con productos, más carga, error y producto no disponible, según los criterios de presentación de este contrato. |
