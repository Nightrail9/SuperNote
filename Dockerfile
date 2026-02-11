# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY frontend-vue/package*.json ./frontend-vue/
RUN npm ci --prefix frontend-vue

FROM deps AS builder
WORKDIR /app
COPY . .

# Build frontend static files for Express static hosting.
RUN npm --prefix frontend-vue run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/web ./web
COPY --from=builder /app/frontend-vue/dist ./frontend-vue/dist

RUN mkdir -p /app/data /app/temp && chown -R app:app /app

USER app

EXPOSE 3000

CMD ["node", "--import", "tsx", "web/server/index.ts"]
