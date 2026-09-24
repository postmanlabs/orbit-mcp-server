FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ src/
RUN pnpm run build

FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist/ dist/
ENV ORBIT_MCP_TRANSPORT=http
ENV ORBIT_MCP_HOST=0.0.0.0
EXPOSE 8080
USER node
CMD ["node", "dist/index.js"]
