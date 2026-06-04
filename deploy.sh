#!/bin/bash
# Script de deploy no servidor Linux
# Uso: ./deploy.sh
# Requisito: rodar como root ou usuário com permissão em /var/www/glme

set -e

APP_DIR="/var/www/glme"
APP_NAME="glme"

echo "==> Atualizando código..."
cd "$APP_DIR"
git pull origin master

echo "==> Instalando dependências..."
pnpm install --frozen-lockfile

echo "==> Aplicando migrações do banco..."
pnpm db:push

echo "==> Compilando para produção..."
pnpm build

echo "==> Reiniciando servidor..."
pm2 restart "$APP_NAME" || pm2 start dist/index.js --name "$APP_NAME"
pm2 save

echo "==> Deploy concluído!"
pm2 status "$APP_NAME"
