# Stripe Checkout: desarrollo y staging

La tienda crea sesiones de Stripe Checkout desde el backend. Sólo un webhook con firma válida confirma el pedido; regresar al navegador desde Stripe únicamente consulta el estado guardado. Consulta el [contrato de Checkout y pedidos](../../contracts/06-CHECKOUT-ORDERS.md) para el modelo de datos y el alcance.

## Antes de probar

El responsable del proyecto prepara una cuenta Stripe en **modo de prueba**, acceso aprobado a Stripe CLI y un catálogo local con productos activos y precios revisados. No uses claves live ni envíes pagos reales. `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` se guardan sólo en el `.env` local, que no se agrega a Git.

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

El listener local no publica un endpoint del Dashboard. Staging necesitará su propio dominio HTTPS, destino de eventos, claves de prueba y secreto `whsec_…`; esa preparación pertenece a la Fase 08. Producción requiere claves live, un endpoint distinto y precios comerciales aprobados. No compartas secretos de un entorno con otro ni los copies al repositorio.

## Webhook público de staging

Cuando la API de staging esté desplegada y tenga un origen HTTPS público comprobado, registra en el sandbox de Stripe un destino de eventos de tipo webhook con URL `https://<dominio-publico-api>/api/webhooks/stripe`. El dominio público de la API recibe el webhook; el proxy del frontend no es el destino. Un dominio proporcionado por el alojamiento sirve si es accesible por HTTPS. No registres una URL ficticia ni la URL local.

1. En Workbench, revisa los destinos existentes para evitar duplicados. Crea un destino de eventos **snapshot** para la cuenta del sandbox y selecciona sólo `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`.
2. Comprueba la versión de API del destino frente a la versión usada por el SDK de Stripe del proyecto; verifica el payload en staging antes de aceptar la integración.
3. Configura exclusivamente en el servicio API de staging `STRIPE_MODE=test`, `STRIPE_SECRET_KEY` con su clave secreta de prueba y `STRIPE_WEBHOOK_SECRET` con el secreto de firma del destino público. `STRIPE_MEDIA_BASE_URL` puede apuntar a una base pública HTTPS de medios del entorno. Configura `FRONTEND_ORIGIN` con el origen HTTPS del frontend de staging.
4. El secreto `whsec_…` del destino público es distinto del que muestra `stripe listen`. La aplicación usa Checkout alojado desde el servidor y no requiere una clave publicable `pk_test_…` en el frontend para este flujo.
5. Ejecuta un Checkout de prueba desde staging. Verifica en Stripe la entrega exitosa del evento y en la aplicación el pedido pagado y la actualización del carrito; registra fecha, versión desplegada y resultado sin guardar secretos ni datos de tarjeta.

Este procedimiento describe una configuración futura y no afirma que el endpoint, las variables o el despliegue existan. Consulta [webhooks de Stripe](https://docs.stripe.com/webhooks) y [claves de API](https://docs.stripe.com/keys?locale=es-419).

Si Stripe no muestra una tarjeta guardada, confirma que la persona aceptó el consentimiento para reutilizarla y que Stripe la considera visible en otro Checkout. Checkout alojado administra el formulario y los datos de pago; la tienda sólo presenta marca, últimos cuatro dígitos y vencimiento elegible. [Stripe documenta los clientes existentes y la reutilización de tarjetas](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted).
