# Stripe Checkout: desarrollo y staging

La tienda crea sesiones de Stripe Checkout desde el backend. Sólo un webhook con firma válida confirma el pedido; regresar al navegador desde Stripe únicamente consulta el estado guardado. Consulta el [contrato de Checkout y pedidos](../../contracts/06-CHECKOUT-ORDERS.md) para el modelo de datos y el alcance.

## Antes de probar

El responsable del proyecto prepara una cuenta Stripe en **modo de prueba**, acceso aprobado a Stripe CLI y un catálogo local con productos activos y precios revisados. No uses claves live ni envíes pagos reales. `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` se guardan sólo en el `.env` local, que no se agrega a Git.

Compose local habilita `CHECKOUT_ENABLED=true` para probar Checkout; `false` (o una variable ausente fuera de Compose) impide crear sesiones de Checkout y reintentos de compra. La API comunica el mismo estado a la tienda: cuando está deshabilitado, el botón de producto dice “Próximamente” y no permite agregar al carrito. El resumen de compra sigue accesible; el backend conserva el bloqueo de Checkout. La configuración de Staging habilita esta bandera sólo junto con `STRIPE_MODE=test` y claves `sk_test_…`. Production la mantiene en `false` hasta recibir autorización expresa para habilitar compras.

En `.env` configura la clave `sk_test_…` de esa cuenta. Inicia la base, backend y frontend según [Compose local](../docker/COMPOSE.md); aplica la migración pendiente y comprueba que la API esté disponible en `http://localhost:4000`.

## Escuchar webhooks locales

Inicia sesión en Stripe CLI con la cuenta de prueba aprobada. Mantén una terminal abierta con este listener limitado a los eventos que procesa la aplicación:

```bash
stripe listen \
  --events=checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired \
  --forward-to http://localhost:4000/api/webhooks/stripe
```

La CLI muestra un secreto `whsec_…` para el listener activo. Guarda ese valor en `STRIPE_WEBHOOK_SECRET` del `.env`, junto con `STRIPE_MODE=test` y `STRIPE_SECRET_KEY=sk_test_…`; luego recrea el backend para que reciba la configuración:

```bash
docker compose up --detach --force-recreate backend
```

El secreto de webhook pertenece a esa instancia de `stripe listen`. Si reinicias el listener, comprueba y actualiza el valor que usa el backend. El secreto de firma y la clave de API son valores distintos y no se intercambian. La [guía de Stripe CLI](https://docs.stripe.com/cli/listen) describe el flujo del listener.

## Recorrido de prueba

1. Inicia sesión en la tienda y agrega un producto activo al carrito.
2. Abre el resumen de compra, revisa el precio vigente y la dirección del destinatario, y continúa a Stripe Checkout.
3. Completa el Checkout con una [tarjeta de prueba de Stripe](https://docs.stripe.com/testing).
4. Comprueba que el listener reciba el evento, el webhook devuelva una respuesta exitosa, el pedido aparezca en **Mis pedidos** y sólo se retiren del carrito las líneas que no cambiaron desde que abriste Checkout.
5. Comprueba un evento repetido y que la página de retorno no muestre un pedido pagado antes de recibir la confirmación del webhook.

Los eventos `checkout.session.completed` y `checkout.session.async_payment_succeeded` confirman un pago si Stripe reporta `payment_status=paid`. Los eventos `checkout.session.async_payment_failed` y `checkout.session.expired` sólo cierran intentos pendientes. La firma se calcula sobre el cuerpo HTTP crudo; el middleware de JSON no debe procesar primero la ruta del webhook. [Stripe explica el formato y la verificación de firmas](https://docs.stripe.com/webhooks).

## Separación de entornos

El listener local no publica un endpoint del Dashboard. En Staging, el `Backend` público recibe los webhooks; verifica el destino y sus entregas del sandbox antes de aceptar el flujo. Producción requiere claves live, un endpoint distinto y precios comerciales aprobados. No compartas secretos entre entornos ni los copies al repositorio. Los nombres y valores de referencia de Railway están en [RAILWAY.md](RAILWAY.md#configuracion-de-referencia-de-staging).

## Webhook público de staging

Para crear o verificar el destino de este Staging, usa la URL `https://backend-staging-c2e45865.up.railway.app/api/webhooks/stripe` mientras ése siga siendo el dominio asignado al servicio `Backend`. El dominio público del Backend recibe el webhook; el proxy del Frontend no es el destino. Si Railway cambia el dominio, reemplázalo con el vigente que aparece en su panel. No registres una URL ficticia ni la URL local.

1. En Workbench, revisa los destinos existentes para evitar duplicados. Actualiza el destino existente o, si no hay uno, crea un destino de eventos **snapshot** para la cuenta del sandbox. Selecciona sólo `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`.
2. Comprueba la versión de API del destino frente a la versión usada por el SDK de Stripe del proyecto; verifica el payload en staging antes de aceptar la integración.
3. Configura exclusivamente en el servicio Railway `Backend` (la API) de Staging `CHECKOUT_ENABLED=true`, `STRIPE_MODE=test`, `STRIPE_SECRET_KEY` con su clave secreta de prueba y `STRIPE_WEBHOOK_SECRET` con el secreto de firma del destino público. `STRIPE_MEDIA_BASE_URL` puede apuntar a una base pública HTTPS de medios del entorno. Configura `FRONTEND_ORIGIN` con el origen HTTPS de `Frontend`.
4. El secreto `whsec_…` del destino público es distinto del que muestra `stripe listen`. La aplicación usa Checkout alojado desde el servidor y no requiere una clave publicable `pk_test_…` en el frontend para este flujo.
5. Ejecuta un Checkout de prueba desde staging. Verifica que Stripe reciba una respuesta `2xx` del webhook y que la aplicación muestre el pedido pagado y actualice el carrito. El regreso verde de Checkout por sí solo no confirma el pedido en la tienda.

#### Si cambia el dominio del Backend

El destino de Stripe conserva la URL que se registró aunque Railway asigne un dominio público nuevo al servicio. Después de cambiarlo:

1. Copia el dominio vigente desde **Backend → Settings → Networking** en Railway y actualiza el destino del sandbox a `https://<dominio-actual>/api/webhooks/stripe`. Si el destino ya existe, edítalo en vez de crear otro.
2. Conserva los cuatro eventos indicados arriba. Si creas un destino nuevo, copia su nuevo secreto de firma en `STRIPE_WEBHOOK_SECRET` del servicio `Backend` y despliega ese servicio antes de reenviar eventos.
3. Comprueba que una entrega de cada evento reciba `2xx`. Si Stripe muestra `404`, la URL o la ruta no corresponde al Backend vigente: el evento no se procesa, el pedido sigue pendiente y no se crea la tarea de correo de compra. El Worker no puede enviar un comprobante que no llegó a su cola.
4. Confirma el estado del pago directamente en Stripe antes de pedir al comprador que intente pagar otra vez. Corrige el destino antes de usar **Resend** para una entrega fallida.

Consulta [webhooks de Stripe](https://docs.stripe.com/webhooks) y [claves de API](https://docs.stripe.com/keys?locale=es-419).

Si Stripe no muestra una tarjeta guardada, confirma que la persona aceptó el consentimiento para reutilizarla y que Stripe la considera visible en otro Checkout. Checkout alojado administra el formulario y los datos de pago; la tienda sólo presenta marca, últimos cuatro dígitos y vencimiento elegible. [Stripe documenta los clientes existentes y la reutilización de tarjetas](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted).
