ALTER TABLE "accounts"
  ADD COLUMN "stripe_customer_id" VARCHAR(255);

CREATE UNIQUE INDEX "accounts_stripe_customer_id_key"
  ON "accounts"("stripe_customer_id");

ALTER TABLE "account_cart_items"
  ADD COLUMN "version" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

CREATE TABLE "orders" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "stripe_checkout_session_id" VARCHAR(255),
  "stripe_payment_intent_id" VARCHAR(255),
  "recipient_name" VARCHAR(255) NOT NULL,
  "recipient_email" VARCHAR(254) NOT NULL,
  "shipping_address" JSONB NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
  "subtotal_cents" INTEGER NOT NULL,
  "total_cents" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMPTZ(6),
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "orders_currency_mxn" CHECK ("currency" = 'MXN'),
  CONSTRAINT "orders_amounts_nonnegative" CHECK ("subtotal_cents" >= 0 AND "total_cents" >= 0),
  CONSTRAINT "orders_total_matches_subtotal" CHECK ("total_cents" = "subtotal_cents")
);

CREATE UNIQUE INDEX "orders_stripe_checkout_session_id_key"
  ON "orders"("stripe_checkout_session_id");
CREATE UNIQUE INDEX "orders_stripe_payment_intent_id_key"
  ON "orders"("stripe_payment_intent_id");
CREATE INDEX "orders_account_id_status_paid_at_idx"
  ON "orders"("account_id", "status", "paid_at");

CREATE TABLE "order_items" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price_cents" INTEGER NOT NULL,
  "line_total_cents" INTEGER NOT NULL,
  "cart_item_version" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_items_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_items_quantity_valid" CHECK ("quantity" BETWEEN 1 AND 99),
  CONSTRAINT "order_items_unit_price_positive" CHECK ("unit_price_cents" > 0),
  CONSTRAINT "order_items_line_total_matches_quantity"
    CHECK ("line_total_cents"::BIGINT = "unit_price_cents"::BIGINT * "quantity"::BIGINT)
);

CREATE INDEX "order_items_order_id_created_at_idx"
  ON "order_items"("order_id", "created_at");
