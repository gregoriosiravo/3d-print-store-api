CREATE TABLE "payment_methods" (
    "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"                  UUID NOT NULL,
    "stripe_customer_id"       VARCHAR(255) NOT NULL,
    "stripe_payment_method_id" VARCHAR(255) NOT NULL,
    "brand"                    VARCHAR(50),
    "last4"                    CHAR(4),
    "exp_month"                SMALLINT,
    "exp_year"                 SMALLINT,
    "is_default"               BOOLEAN NOT NULL DEFAULT false,
    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_methods_stripe_payment_method_id_key" UNIQUE ("stripe_payment_method_id"),
    CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "payment_methods_user_id_idx" ON "payment_methods"("user_id");
CREATE UNIQUE INDEX payment_methods_one_default_per_user_idx ON "payment_methods" ("user_id") WHERE "is_default" = "true";