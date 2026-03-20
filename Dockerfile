FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY client ./client
COPY server ./server
COPY shared ./shared
COPY script ./script
COPY components.json ./components.json
COPY drizzle.config.ts ./drizzle.config.ts
COPY postcss.config.js ./postcss.config.js
COPY tailwind.config.ts ./tailwind.config.ts
COPY tsconfig.json ./tsconfig.json
COPY vite.config.ts ./vite.config.ts

RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3001

CMD ["npm", "run", "start"]
