CREATE TABLE "account_cart_items" (
  "account_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "account_cart_items_pkey" PRIMARY KEY ("account_id", "product_id"),
  CONSTRAINT "account_cart_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 99)
);

CREATE INDEX "account_cart_items_account_id_created_at_idx"
  ON "account_cart_items"("account_id", "created_at");
CREATE INDEX "account_cart_items_product_id_idx" ON "account_cart_items"("product_id");

CREATE TABLE "account_cart_merges" (
  "account_id" UUID NOT NULL,
  "transfer_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_cart_merges_pkey" PRIMARY KEY ("account_id", "transfer_id")
);

ALTER TABLE "account_cart_items"
  ADD CONSTRAINT "account_cart_items_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_cart_items"
  ADD CONSTRAINT "account_cart_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_cart_merges"
  ADD CONSTRAINT "account_cart_merges_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
