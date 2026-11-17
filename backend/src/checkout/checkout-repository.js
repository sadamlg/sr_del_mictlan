const TERMINAL_ATTEMPT_STATUSES = new Set(['FAILED', 'EXPIRED']);
const CONFIRMABLE_ORDER_STATUSES = ['PENDING', ...TERMINAL_ATTEMPT_STATUSES];

export function createCheckoutRepository(database) {
  return {
    async getStripeCustomerId(accountId) {
      const account = await database.account.findUnique({
        where: { id: accountId },
        select: { stripeCustomerId: true },
      });
      return account?.stripeCustomerId ?? null;
    },

    async getAccountCartForCheckout(accountId) {
      const rows = await database.accountCartItem.findMany({
        where: { accountId },
        select: {
          productId: true,
          quantity: true,
          version: true,
          product: {
            select: { slug: true, name: true, active: true, priceCents: true, imageKey: true },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { productId: 'asc' }],
      });
      return rows.map(({ product, ...item }) => ({ ...item, ...product }));
    },

    createPendingOrder({ accountId, recipientName, recipientEmail, shippingAddress, currency, subtotalCents, totalCents, items, createdAt }) {
      return database.order.create({
        data: {
          accountId,
          recipientName,
          recipientEmail,
          shippingAddress,
          status: 'PENDING',
          currency,
          subtotalCents,
          totalCents,
          createdAt,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              slug: item.slug,
              name: item.name,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              lineTotalCents: item.lineTotalCents,
              cartItemVersion: item.cartItemVersion,
            })),
          },
        },
        select: { id: true },
      });
    },

    async attachCheckoutSession({ orderId, sessionId }) {
      const result = await database.order.updateMany({
        where: {
          id: orderId,
          status: 'PENDING',
          stripeCheckoutSessionId: null,
        },
        data: { stripeCheckoutSessionId: sessionId },
      });
      if (result.count !== 1) throw new Error('No se pudo guardar la sesión de Checkout.');
    },

    async confirmPaidOrder({ orderId, sessionId, paymentIntentId, customerId, amountTotal, currency, paidAt }) {
      return database.$transaction(async (transaction) => {
        const order = await transaction.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });
        if (!order) throw new Error('No se encontró la orden de Checkout.');
        if (order.status === 'PAID' && order.stripeCheckoutSessionId === sessionId) return { updated: false };

        const expectedTotal = order.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
        if (
          !CONFIRMABLE_ORDER_STATUSES.includes(order.status) ||
          order.stripeCheckoutSessionId !== sessionId ||
          order.currency !== currency ||
          order.totalCents !== amountTotal ||
          order.subtotalCents !== order.totalCents ||
          expectedTotal !== order.totalCents
        ) throw new Error('La sesión no coincide con la instantánea pendiente.');

        const updated = await transaction.order.updateMany({
          where: {
            id: order.id,
            status: { in: CONFIRMABLE_ORDER_STATUSES },
            stripeCheckoutSessionId: sessionId,
          },
          data: {
            status: 'PAID',
            stripePaymentIntentId: paymentIntentId,
            paidAt,
          },
        });
        if (updated.count !== 1) {
          const current = await transaction.order.findUnique({ where: { id: orderId } });
          if (current?.status === 'PAID' && current.stripeCheckoutSessionId === sessionId) return { updated: false };
          throw new Error('No se pudo confirmar el estado del pedido.');
        }

        if (customerId) {
          const customerLink = await transaction.account.updateMany({
            where: { id: order.accountId, OR: [{ stripeCustomerId: null }, { stripeCustomerId: customerId }] },
            data: { stripeCustomerId: customerId },
          });
          if (customerLink.count !== 1) throw new Error('El Customer de Stripe ya está asociado a otra cuenta.');
        }

        for (const item of order.items) {
          await transaction.accountCartItem.deleteMany({
            where: {
              accountId: order.accountId,
              productId: item.productId,
              quantity: item.quantity,
              version: item.cartItemVersion,
            },
          });
        }

        await transaction.emailJob.create({
          data: { accountId: order.accountId, orderId: order.id, type: 'PURCHASE_CONFIRMATION' },
        });

        return { updated: true };
      });
    },

    async closePendingOrder({ orderId, sessionId, status }) {
      if (!TERMINAL_ATTEMPT_STATUSES.has(status)) return;
      await database.order.updateMany({
        where: {
          id: orderId,
          status: 'PENDING',
          OR: [{ stripeCheckoutSessionId: null }, { stripeCheckoutSessionId: sessionId }],
        },
        data: { status, stripeCheckoutSessionId: sessionId },
      });
    },

    listPaidOrders(accountId) {
      return database.order.findMany({
        where: { accountId, status: 'PAID' },
        select: {
          id: true,
          status: true,
          currency: true,
          subtotalCents: true,
          totalCents: true,
          createdAt: true,
          paidAt: true,
          items: {
            select: {
              slug: true,
              name: true,
              quantity: true,
              unitPriceCents: true,
              lineTotalCents: true,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      });
    },

    async getCheckoutSessionStatus(accountId, sessionId) {
      const order = await database.order.findFirst({
        where: { accountId, stripeCheckoutSessionId: sessionId },
        select: { status: true },
      });
      return order?.status ?? null;
    },

    async reorderPaidOrder({ accountId, orderId, transferId }) {
      return database.$transaction(async (transaction) => {
        const order = await transaction.order.findFirst({
          where: { id: orderId, accountId, status: 'PAID' },
          select: { items: { select: { slug: true, quantity: true } } },
        });
        if (!order) return null;

        const receipt = await transaction.$queryRaw`
          INSERT INTO "account_cart_merges" ("account_id", "transfer_id")
          VALUES (${accountId}::uuid, ${transferId}::uuid)
          ON CONFLICT ("account_id", "transfer_id") DO NOTHING
          RETURNING "transfer_id"
        `;
        if (!receipt.length) {
          const [existingReceipt] = await transaction.$queryRaw`
            SELECT "unavailable_slugs"
            FROM "account_cart_merges"
            WHERE "account_id" = ${accountId}::uuid AND "transfer_id" = ${transferId}::uuid
          `;
          return { applied: false, unavailableSlugs: existingReceipt?.unavailable_slugs ?? [] };
        }

        const products = await transaction.product.findMany({
          where: {
            slug: { in: order.items.map((item) => item.slug) },
            active: true,
            priceCents: { gt: 0 },
          },
          select: { id: true, slug: true },
        });
        const productsBySlug = new Map(products.map((product) => [product.slug, product]));
        const unavailableSlugs = [];
        for (const item of order.items) {
          const product = productsBySlug.get(item.slug);
          if (!product) {
            unavailableSlugs.push(item.slug);
            continue;
          }
          await transaction.$executeRaw`
            INSERT INTO "account_cart_items" ("account_id", "product_id", "quantity", "version", "created_at", "updated_at")
            VALUES (${accountId}::uuid, ${product.id}::uuid, ${item.quantity}, gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT ("account_id", "product_id")
            DO UPDATE SET
              "quantity" = LEAST(99, "account_cart_items"."quantity" + EXCLUDED."quantity"),
              "version" = gen_random_uuid(),
              "updated_at" = CURRENT_TIMESTAMP
          `;
        }
        await transaction.$executeRaw`
          UPDATE "account_cart_merges"
          SET "unavailable_slugs" = ${unavailableSlugs}::text[]
          WHERE "account_id" = ${accountId}::uuid AND "transfer_id" = ${transferId}::uuid
        `;
        return { applied: true, unavailableSlugs };
      });
    },
  };
}
