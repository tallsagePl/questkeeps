FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=384
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG SOURCE_REVISION=local
ENV APP_URL=https://questkeeps.ru
ENV DATABASE_PATH=/tmp/questkeeps-build.sqlite
RUN npm run build && node --import tsx --input-type=module -e "import fs from 'node:fs'; import {migrations} from './lib/migrations/index.ts'; fs.writeFileSync('deployment.json',JSON.stringify({schema:migrations.at(-1).version}));" && npm prune --omit=dev && rm -rf .next/cache

FROM node:24-bookworm-slim AS runtime
ARG APP_UID=997
ARG APP_GID=997
ARG SOURCE_REVISION=local
LABEL org.opencontainers.image.title="QuestKeeps" org.opencontainers.image.revision=$SOURCE_REVISION
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=384
WORKDIR /app
COPY --from=build --chown=$APP_UID:$APP_GID /app/.next ./.next
COPY --from=build --chown=$APP_UID:$APP_GID /app/node_modules ./node_modules
COPY --from=build --chown=$APP_UID:$APP_GID /app/public ./public
COPY --from=build --chown=$APP_UID:$APP_GID /app/lib ./lib
COPY --from=build --chown=$APP_UID:$APP_GID /app/scripts ./scripts
COPY --from=build --chown=$APP_UID:$APP_GID /app/package.json /app/next.config.ts /app/deployment.json ./
USER $APP_UID:$APP_GID
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 CMD ["node","scripts/container-health.mjs"]
CMD ["node","--env-file=/run/questkeeps.env","node_modules/next/dist/bin/next","start","--hostname","0.0.0.0","--port","3000"]
