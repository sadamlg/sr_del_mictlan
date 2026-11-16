ALTER TABLE "account_cart_merges"
  ADD COLUMN "unavailable_slugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
