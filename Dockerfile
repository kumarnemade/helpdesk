# Production image: the API serves the built client from one origin (see
# server/src/app.ts). Built and run by Render (render.yaml); see DEPLOYMENT.md.
FROM oven/bun:1.4.3

# Prisma's migration engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so this layer is reused when only source changes.
# The server's postinstall runs `prisma generate`, which needs the schema and
# a DATABASE_URL (any value; nothing connects at build time).
COPY package.json bun.lock ./
COPY core/package.json core/
COPY client/package.json client/
COPY server/package.json server/prisma.config.ts server/
COPY server/prisma server/prisma
COPY e2e/package.json e2e/
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build bun install --frozen-lockfile

COPY . .

# Vite bakes VITE_* variables into the client at build time.
ARG VITE_SENTRY_DSN
RUN bun run --cwd client build

ENV NODE_ENV=production
WORKDIR /app/server

# Apply pending migrations, then start the API (the `start` script's command,
# run with exec so the server gets SIGTERM and shuts down gracefully).
CMD ["sh", "-c", "bun --bun prisma migrate deploy && exec bun run --preload ./src/instrument.ts src/index.ts"]
