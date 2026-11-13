CREATE TABLE "worker_heartbeats" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);
