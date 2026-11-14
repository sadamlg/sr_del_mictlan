CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120),
    "description" TEXT,
    "price_cents" INTEGER,
    "image_key" VARCHAR(512),
    "image_alt" VARCHAR(240),
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT "products_price_positive" CHECK ("price_cents" IS NULL OR "price_cents" > 0),
    CONSTRAINT "products_active_complete" CHECK (
        NOT "active" OR (
            "name" IS NOT NULL AND length(trim("name")) > 0 AND
            "description" IS NOT NULL AND length(trim("description")) > 0 AND
            "price_cents" IS NOT NULL AND "price_cents" > 0 AND
            "image_key" IS NOT NULL AND "image_key" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$' AND
            "image_alt" IS NOT NULL AND length(trim("image_alt")) > 0
        )
    )
);

CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE INDEX "products_active_position_slug_idx" ON "products"("active", "position", "slug");
ALTER TABLE "products"
  ADD COLUMN "lifestyle_image_key" VARCHAR(512),
  ADD COLUMN "label_one" VARCHAR(80),
  ADD COLUMN "label_two" VARCHAR(80);

ALTER TABLE "products" DROP CONSTRAINT "products_active_complete";
ALTER TABLE "products" ADD CONSTRAINT "products_active_complete" CHECK (
  NOT "active" OR (
    "name" IS NOT NULL AND length(trim("name")) > 0 AND
    "description" IS NOT NULL AND length(trim("description")) > 0 AND
    "price_cents" IS NOT NULL AND "price_cents" > 0 AND
    "image_key" IS NOT NULL AND "image_key" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$' AND
    "image_alt" IS NOT NULL AND length(trim("image_alt")) > 0 AND
    "lifestyle_image_key" IS NOT NULL AND "lifestyle_image_key" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$' AND
    "label_one" IS NOT NULL AND length(trim("label_one")) > 0 AND
    "label_two" IS NOT NULL AND length(trim("label_two")) > 0
  )
);
ALTER TABLE "products"
  ADD COLUMN "sensory_profile" TEXT,
  ADD COLUMN "alcohol_min_percent" DOUBLE PRECISION,
  ADD COLUMN "alcohol_max_percent" DOUBLE PRECISION,
  ADD COLUMN "volume_ml" INTEGER;

ALTER TABLE "products" ADD CONSTRAINT "products_insights_valid" CHECK (
  ("sensory_profile" IS NULL OR length(trim("sensory_profile")) > 0) AND
  (
    ("alcohol_min_percent" IS NULL AND "alcohol_max_percent" IS NULL) OR
    (
      "alcohol_min_percent" IS NOT NULL AND
      "alcohol_max_percent" IS NOT NULL AND
      "alcohol_min_percent" > 0 AND
      "alcohol_max_percent" >= "alcohol_min_percent" AND
      "alcohol_max_percent" <= 100
    )
  ) AND
  ("volume_ml" IS NULL OR "volume_ml" > 0)
);

UPDATE "products" SET
  "sensory_profile" = 'Notas frutales y dulces únicas, con un retrogusto terroso que evoca las antiguas haciendas pulqueras.',
  "alcohol_min_percent" = 36,
  "alcohol_max_percent" = 42,
  "volume_ml" = 750
WHERE "slug" = 'calios';

UPDATE "products" SET
  "sensory_profile" = 'Aromas frescos a hierba y tierra húmeda. Entrada potente en boca con un ahumado auténtico y persistente.',
  "alcohol_min_percent" = 45,
  "alcohol_max_percent" = 45,
  "volume_ml" = 750
WHERE "slug" = 'mezcal-joven';

UPDATE "products" SET
  "sensory_profile" = 'Notas dulces de quiote y madera con un final ahumado elegante. Cuerpo robusto y matices dorados brillantes.',
  "alcohol_min_percent" = 40,
  "alcohol_max_percent" = 40,
  "volume_ml" = 750,
  "name" = CASE WHEN "name" = 'Mezcal · Doble destilación' THEN 'Mezcal reposado · Doble destilación' ELSE "name" END
WHERE "slug" = 'mezcal-doble-destilacion';
CREATE TABLE "site_visits" (
  "id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "site_visit_counter" (
  "id" SMALLINT NOT NULL DEFAULT 1,
  "visit_count" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "site_visit_counter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "site_visit_counter_singleton" CHECK ("id" = 1),
  CONSTRAINT "site_visit_counter_nonnegative" CHECK ("visit_count" >= 0)
);

INSERT INTO "site_visit_counter" ("id", "visit_count")
SELECT 1, COUNT(*) FROM "site_visits";

CREATE FUNCTION increment_site_visit_counter() RETURNS trigger AS $$
BEGIN
  UPDATE "site_visit_counter"
  SET "visit_count" = "visit_count" + 1
  WHERE "id" = 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "site_visits_increment_counter"
AFTER INSERT ON "site_visits"
FOR EACH ROW
EXECUTE FUNCTION increment_site_visit_counter();
