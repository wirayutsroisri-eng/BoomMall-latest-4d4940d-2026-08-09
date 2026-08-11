FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S boom && adduser -S boom -G boom \
  && mkdir -p /app/deploy/certs \
  && chown -R boom:boom /app
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
RUN npm prune --omit=dev \
  && chown -R boom:boom /app
USER boom
EXPOSE 4000
# Mount TLS material: ./deploy/certs → /app/deploy/certs
CMD ["sh", "-c", "node dist/cli/migrate-deploy.js && node dist/index.js"]
