FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations

RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/config ./src/config

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 CMD node -e "const net = require('node:net'); const socket = net.connect(3000, '127.0.0.1'); socket.on('connect', () => process.exit(0)); socket.on('error', () => process.exit(1));"

CMD ["npm", "run", "start"]
