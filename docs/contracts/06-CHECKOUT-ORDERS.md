# Contrato 06: Stripe Checkout y pedidos

**Estado:** en implementación — 16 de noviembre de 2026.
**Base integrada:** `9df14c28899f4dc1a320b01ddb7df00e249bab89`, ancestro del merge `3bc2b0813c376b6458c204c6c54782d3c0d312fc` del PR #13 en `develop`.

## Objetivo y recorrido

Permitir que una persona con sesión confirme una compra mediante Stripe Checkout alojado y consultar pedidos pagados desde su cuenta. La orden conserva una instantánea independiente del catálogo y del perfil; sólo un webhook de Stripe con firma válida confirma el pago.

1. El carrito ofrece acceso al resumen de compra. Una persona invitada inicia sesión o se registra; la intención `continuar=checkout` sobrevive la autenticación y la confirmación del correo.
2. `/cuenta/checkout` muestra primero los productos editables con sus imágenes; después, el destinatario y domicilio de esta compra; las tarjetas guardadas que Stripe permite mostrar; y al final el subtotal y la acción morada para continuar a Stripe.
3. El resumen permite editar nombre, correo y domicilio del destinatario sin modificar el perfil. Las cantidades se editan mediante el carrito de cuenta. El backend vuelve a consultar productos activos y precios vigentes al crear cada sesión.
4. La API guarda una orden pendiente con su instantánea y crea una sesión alojada en modo `payment`. La interfaz valida que el destino sea `https://checkout.stripe.com` antes de salir de la tienda.
5. Stripe devuelve a `/cuenta/pedidos` con el ID de sesión. El navegador sólo consulta el estado; no confirma el pago. Un webhook firmado confirma el pedido y permite que la interfaz actualice el carrito y el historial.
6. “Mis pedidos” muestra únicamente compras pagadas del titular. “Volver a pedir” suma al carrito los productos disponibles de la orden y abre el resumen.

## Alcance y límites

- Incluye Checkout alojado, validación y persistencia de órdenes, webhooks firmados, tarjetas guardadas con consentimiento de reutilización, estados de retorno, pedidos propios y volver a pedir.
- El checkout requiere sesión de cuenta. La identidad procede de la cookie validada; el navegador no envía identificador de cuenta, importes, precios ni lista de productos para decidir el cobro.
- Los importes se almacenan en centavos de MXN. No se reservan ni verifican existencias; los precios comerciales deben aprobarse antes de habilitar Producción.
- La aplicación no recibe ni almacena el PAN, CVC, ID de PaymentMethod ni fingerprint de tarjetas. Sólo presenta marca, últimos cuatro dígitos, vencimiento y, si Stripe lo devuelve, nombre del titular.
- Stripe puede guardar un método de pago únicamente cuando la persona acepta el consentimiento que presenta Checkout. La tienda consulta y muestra sólo tarjetas elegibles para volver a mostrarse.
- Los cambios de destinatario pertenecen a una sola compra y no alteran el perfil ni el Customer de Stripe.
- No incluye correo de compra, PDF, cola de confirmación, panel administrativo, inventario, logística, métodos de pago alternativos configurados por cuenta ni despliegue de Staging/Producción. El correo y PDF pertenecen a la fase 07; el webhook público de Staging, a la fase 08.
- El modo local de esta fase es Stripe de prueba. No se configuran claves live ni se hacen cobros reales.

## Pantallas y estados

| Superficie | Comportamiento |
|---|---|
| `/cuenta/checkout` | Requiere sesión; si falta, redirige a inicio de sesión con `continuar=checkout`. Muestra carga, error recuperable, carrito vacío, productos no disponibles, tarjetas cargando/error/sin resultados y envío ocupado. |
| Resumen de productos | Presenta imagen, nombre, cantidad, precio unitario vigente y subtotal. Permite editar cantidades o quitar productos; una línea no disponible no muestra un importe que ya no puede confirmarse y debe quitarse antes de pagar. |
| Destinatario | Se precarga desde el perfil y se puede editar para este pedido. Valida nombre, correo y todos los campos del domicilio, incluido código postal de cinco dígitos. Cancelar descarta el borrador; guardar afecta sólo la compra actual. |
| Tarjetas guardadas | Muestra sólo marca, últimos cuatro y vencimiento (más el nombre de titular si Stripe lo devuelve). No permite administrar ni eliminar tarjetas. Checkout alojado gestiona la selección, entrada y consentimiento para guardar. |
| Retorno | `checkout.session.completed` no se presume sólo porque el navegador regrese. La página consulta `GET /api/checkout/return-status`; hasta recibir `PAID` muestra que la confirmación está pendiente. Cancelar informa que el carrito se conserva. |
| `/cuenta/pedidos` | Incluye carga, error y reintento, sesión vencida, estado vacío y lista de pedidos pagados con importe e instantánea histórica. No inventa órdenes ni muestra intentos pendientes, fallidos o expirados. |
| Volver a pedir | Añade cada artículo disponible al carrito con transferencia idempotente y abre `/cuenta/checkout`; los productos inactivos se omiten y se informa cuáles no se pudieron agregar. |

La interfaz usa los componentes, tipografía, colores, foco y espaciado de [DESIGN.md](../DESIGN.md). La acción para abrir Checkout usa `mictlan-stripe-purple`; el verde agua conserva los controles generales y el foco visible. Las vistas se revisan a 320, 768, 1024 y 1440 px, con teclado y sin desbordamiento horizontal.

## API y acceso

| Método y ruta | Acceso | Resultado |
|---|---|---|
| `GET /api/checkout/payment-methods` | Sesión | `{ cards: [] }` cuando la cuenta no tiene Customer; si hay, entrega sólo los campos seguros descritos arriba. |
| `POST /api/checkout/sessions` | Sesión | Crea una instantánea pendiente desde el carrito de cuenta y devuelve `{ checkoutUrl }`. Acepta sólo `recipient` opcional; omite precios, identidad y líneas del cliente. |
| `GET /api/checkout/return-status?session_id=…` | Sesión | Devuelve el estado de una sesión vinculada a esa cuenta; una sesión de otra cuenta se trata como `NOT_FOUND`. |
| `POST /api/webhooks/stripe` | Firma Stripe | Verifica `Stripe-Signature` sobre los bytes crudos del cuerpo antes de leer el evento o tocar datos. |
| `GET /api/orders` | Sesión | Devuelve `200 { orders: [] }` si no hay compras; sólo lista órdenes pagadas del titular autenticado. |
| `POST /api/orders/:orderId/reorder` | Sesión | Suma una sola vez los productos activos de un pedido pagado propio mediante una clave UUID; informa los slugs que ya no están disponibles y conserva esa lista al reintentar la misma clave. |

Los endpoints privados responden con `Cache-Control: no-store` y el formato `{ error: { code, message } }`. El carrito vacío responde `409 CART_EMPTY`; una línea inactiva, eliminada o con precio inválido responde `409 PRODUCT_NOT_AVAILABLE` y no crea sesión. Los fallos de Stripe o persistencia no exponen detalles internos.

### Validación del destinatario

`recipient` debe contener exactamente `name`, `email` y `address`; la dirección contiene exactamente `street`, `number`, `neighborhood`, `locality`, `state` y `postalCode`. Se recortan espacios; el correo se normaliza a minúsculas. Nombre: 1–255 caracteres; correo: máximo 254 y formato válido; cada campo de domicilio: 1–120 caracteres; código postal: cinco dígitos. Cualquier campo inesperado se rechaza.

## Persistencia y concurrencia

- Cada intento válido crea un `Order` propio en estado `PENDING`, con cuenta, destinatario, domicilio, moneda, subtotal, total y fecha.
- Cada `OrderItem` conserva `productId` como referencia histórica sin relación que dependa de la ficha vigente, slug, nombre, cantidad, precio unitario, subtotal y un token UUID de la línea de carrito que se cotizó.
- `orders.stripe_checkout_session_id` y `orders.stripe_payment_intent_id` son únicos cuando tienen valor. Una cuenta puede guardar un `stripe_customer_id` único y opcional; estos IDs no se exponen al navegador.
- La sesión de Stripe usa `mode=payment`, `currency=mxn`, line items formados por el servidor desde la instantánea, el ID de orden en `client_reference_id` y metadata, y el origen frontal validado para las URL fija de éxito y cancelación. Cada nueva solicitud explícita crea una orden/sesión; si la llamada de red a Stripe se reintenta, el SDK conserva la clave de idempotencia derivada del ID de esa orden.
- `AccountCartItem.version` cambia en toda escritura, edición, fusión o recreación de línea. Si el webhook confirma el pago, una transacción marca la orden como pagada y elimina una línea sólo cuando cuenta, producto, cantidad y token coinciden con la instantánea. Cambios hechos durante Checkout se conservan incluso si la línea se borró y recreó con la misma cantidad.
- “Volver a pedir” consulta el pedido pagado bajo la cuenta autenticada; un UUID de transferencia único registra la operación y su lista de productos no disponibles. Reintentar la misma solicitud no suma cantidades de nuevo y devuelve el mismo resultado. Los productos inactivos se omiten y se reportan.
- Una integración de la dependencia de Fase 05 añade `AccountCartItem.version` por migración. Se requiere porque el esquema integrado aún no distingue mediante un token una línea editada o recreada con la misma cantidad; comparar sólo cantidad/fecha podría eliminar una edición concurrente.
- El historial lee nombre, slug, cantidad y precios de `OrderItem`; cambios posteriores del catálogo no alteran una compra ya pagada.

## Eventos y transiciones

- Se verifican los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`.
- Sólo `checkout.session.completed` o `checkout.session.async_payment_succeeded` con `mode=payment` y `payment_status=paid` pueden confirmar la orden.
- Antes de confirmar se comprueban el ID de orden en metadata, coincidencia exacta con `client_reference_id`, ID de sesión vinculado, importe total guardado, moneda MXN y el Customer vinculado a la cuenta.
- La transición a `PAID`, el enlace seguro del Customer y la limpieza condicional del carrito son atómicos e idempotentes. Repetir el evento no duplica la orden ni borra cambios posteriores.
- Eventos de pago fallido o sesión vencida cierran sólo intentos pendientes. No aparecen en “Mis pedidos”. Eventos desconocidos se reconocen sin efecto. Una falla temporal de PostgreSQL debe producir respuesta no exitosa para permitir el reintento de Stripe.
- Firma ausente o inválida, cuerpo no crudo o JSON inválido responde `400` sin cambiar datos. El retorno de navegador, `success_url`, `cancel_url` y cualquier dato del cliente no confirma una compra.

## Criterios de aceptación

| ID | Criterio |
|---|---|
| C06-01 | Un invitado llega a autenticación desde el carrito y, tras iniciar sesión o confirmar una cuenta nueva, vuelve al resumen de compra. |
| C06-02 | El resumen muestra y permite editar cantidades; un artículo no disponible no puede cobrarse y se puede quitar. |
| C06-03 | El destinatario se valida y cambia sólo en la orden; las tarjetas mostradas contienen únicamente campos permitidos y consentimiento explícito para su reutilización. |
| C06-04 | Sesión ausente, carrito vacío, campos inesperados, destinatario inválido, línea no disponible, precio alterado desde el cliente y URLs Stripe inválidas no inician un cobro. |
| C06-05 | La API construye precio, moneda y line items exclusivamente con datos vigentes del servidor y persiste una instantánea independiente del catálogo. |
| C06-06 | La firma se verifica sobre cuerpo crudo; una firma inválida no altera pedidos. Pago se confirma sólo con evento firmado y se validan cuenta, sesión, modo, moneda e importe. |
| C06-07 | Un reintento de red de Stripe conserva la clave idempotente de la misma sesión; una nueva solicitud explícita inicia una orden/sesión nueva. Eventos repetidos no duplican una orden y la confirmación no elimina otra compra ni cambios de cantidad, edición o recreación hechos durante Checkout. |
| C06-08 | “Mis pedidos” sólo devuelve compras pagadas del titular, respeta sus estados de carga/error/vacío y conserva datos históricos del producto. |
| C06-09 | “Volver a pedir” agrega artículos disponibles una sola vez y abre el resumen. |
| C06-10 | Pruebas unitarias, HTTP y PostgreSQL, lint, validación/generación de Prisma y build pasan; se prueba el webhook local firmado con Stripe CLI de prueba cuando la cuenta/CLI estén disponibles. |
| C06-11 | Las pantallas se comparan en navegador en móvil/escritorio a 320, 768, 1024 y 1440 px, con estados relevantes, teclado, foco y consola revisados. |
| C06-12 | La evidencia final especifica entorno, fecha, commit, comandos y resultado por separado para código, configuración externa y recorrido completo. Ninguna cuenta, clave, webhook ni proveedor se marca configurado sin evidencia directa. |

## Configuración externa y referencias

Para la comprobación local se requiere que el responsable prepare una cuenta Stripe en modo de prueba y acceso aprobado a Stripe CLI antes de iniciar `stripe listen`. La CLI emite un secreto `whsec_…` propio de esa sesión; las claves quedan únicamente en el `.env` local, nunca en Git. No se requiere publicar un endpoint para el túnel local. Staging prepara otro secreto de webhook y claves de prueba durante Fase 08; no se reutilizan secretos locales ni de Producción.

Referencias oficiales: [crear Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create?lang=node), [webhooks y verificación de firma](https://docs.stripe.com/webhooks), [cumplimiento de Checkout](https://docs.stripe.com/checkout/fulfillment) y [métodos de pago de clientes existentes y consentimiento](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted).
