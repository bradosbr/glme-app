# GLME: build do client (Vite) + server (esbuild) e execução com node.
# Mantém devDependencies para rodar db:push / db:seed dentro do container.
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
