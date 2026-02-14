# syntax=docker/dockerfile:1

# Stage 1: Base with Node.js and Python
FROM node:20-bookworm AS base

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment and install Whisper
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir openai-whisper torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

WORKDIR /app

# Stage 2: Dependencies
FROM base AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY apps/web/package*.json ./apps/web/
RUN npm ci --prefix apps/web

# Stage 3: Builder
FROM deps AS builder
WORKDIR /app
COPY . .

# Build frontend static files
RUN npm --prefix apps/web run build

# Stage 4: Runtime
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV PATH="/opt/venv/bin:$PATH"

# Install runtime dependencies (Python, FFmpeg)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy Python virtual environment from base
COPY --from=base /opt/venv /opt/venv

# Create app user
RUN groupadd -r app && useradd -r -g app app

# Copy application files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/requirements.txt ./

# Create storage directories and set permissions
RUN mkdir -p /app/storage/data /app/storage/temp && \
    chown -R app:app /app

USER app

EXPOSE 3000

CMD ["node", "--import", "tsx", "apps/server/index.ts"]
