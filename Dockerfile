# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY apps/web/package*.json ./apps/web/
RUN npm ci --prefix apps/web

FROM deps AS builder
WORKDIR /app
COPY . .

# Build frontend static files for Express static hosting.
RUN npm --prefix apps/web run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages

RUN mkdir -p /app/storage/data /app/storage/temp && chown -R app:app /app

USER app

EXPOSE 3000

CMD ["node", "--import", "tsx", "apps/server/index.ts"]
