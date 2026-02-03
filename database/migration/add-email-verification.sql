ALTER TABLE users 
ADD COLUMN email_verified BOOLEAN DEFAULT false,
ADD COLUMN verification_token VARCHAR(255),
ADD COLUMN verification_token_expires TIMESTAMP;
