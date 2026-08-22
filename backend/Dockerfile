# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.17.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM base AS production-dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

FROM base AS runner
ENV PORT=4000 \
    API_HOST_BIND=0.0.0.0
RUN groupadd --system boom \
  && useradd --system --gid boom --create-home boom \
  && mkdir -p /app/data /app/deploy/certs \
  && chown -R boom:boom /app

COPY --chown=boom:boom package.json package-lock.json ./
COPY --chown=boom:boom --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=boom:boom --from=build /app/dist ./dist
COPY --chown=boom:boom --from=build /app/prisma ./prisma
COPY --chown=boom:boom assets ./assets

USER boom
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Keep the backend's existing production start/migration contract.
CMD ["npm", "run", "start:prod"]
