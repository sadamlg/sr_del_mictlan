import { randomUUID } from 'node:crypto';

export function createCartRepository(database) {
  return {
    findAccountCartItems(accountId) {
      return database.accountCartItem.findMany({
        where: { accountId },
        orderBy: { createdAt: 'asc' },
        include: { product: true },
      });
    },

    findPurchasableProductBySlug(slug) {
      return database.product.findFirst({ where: { slug, active: true, priceCents: { gt: 0 } } });
    },

    setAccountCartItem({ accountId, productId, quantity }) {
      return database.accountCartItem.upsert({
        where: { accountId_productId: { accountId, productId } },
        create: { accountId, productId, quantity, version: randomUUID() },
        update: { quantity, version: randomUUID() },
      });
    },

    async removeAccountCartItem(accountId, slug) {
      await database.accountCartItem.deleteMany({ where: { accountId, product: { slug } } });
    },

    mergeGuestCart(accountId, transferId, items) {
      return database.$transaction(async (transaction) => {
        const receipt = await transaction.$queryRaw`
          INSERT INTO "account_cart_merges" ("account_id", "transfer_id")
          VALUES (${accountId}::uuid, ${transferId}::uuid)
          ON CONFLICT ("account_id", "transfer_id") DO NOTHING
          RETURNING "transfer_id"
        `;
        if (!receipt.length) return false;

        const products = await transaction.product.findMany({
          where: { slug: { in: items.map(({ slug }) => slug) }, active: true, priceCents: { gt: 0 } },
          select: { id: true, slug: true },
        });
        if (products.length !== items.length) {
          const error = new Error('Este producto ya no está disponible.');
          error.status = 409;
          error.code = 'PRODUCT_NOT_AVAILABLE';
          const availableSlugs = new Set(products.map((product) => product.slug));
          error.fields = { unavailableSlugs: items.map((item) => item.slug).filter((slug) => !availableSlugs.has(slug)) };
          throw error;
        }

        const productsBySlug = new Map(products.map((product) => [product.slug, product]));
        for (const item of items) {
          const product = productsBySlug.get(item.slug);
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
        return true;
      });
    },
  };
}
