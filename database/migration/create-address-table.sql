BEGIN;

CREATE TABLE addresses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL,
    first_name  VARCHAR(255) NOT NULL,
    last_name   VARCHAR(255) NOT NULL,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
    label       VARCHAR(50),  -- e.g. 'Home', 'Work', 'Billing'
    address     VARCHAR(255),
    address_info VARCHAR(255),
    city        VARCHAR(255),
    country     VARCHAR(255),
    zip         VARCHAR(20),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_address_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX one_primary_per_user
    ON addresses (user_id)
    WHERE is_primary = TRUE;

ALTER TABLE users
    DROP COLUMN address,
    DROP COLUMN address_info,
    DROP COLUMN city,
    DROP COLUMN state,
    DROP COLUMN zip;

    COMMIT;