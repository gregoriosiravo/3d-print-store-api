FROM node:22-bookworm-slim

WORKDIR /app

COPY . .
RUN npm ci

EXPOSE 4000

CMD ["npm", "run", "dev"]
