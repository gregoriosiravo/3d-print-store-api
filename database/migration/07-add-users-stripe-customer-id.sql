-- One Stripe customer per user, used for saved cards (payment methods)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) UNIQUE;
