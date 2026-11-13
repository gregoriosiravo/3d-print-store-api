FROM node:22-bookworm-slim

# Prisma's engine needs openssl to pick the right binary
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .
RUN npm ci

EXPOSE 4000

# Regenerate the Prisma client here: src/generated holds the macOS engine from the host
CMD ["sh", "-c", "npx prisma generate && npm run dev"]
