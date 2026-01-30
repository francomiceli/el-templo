#!/bin/bash
# El Templo - Update Server Script
# Run this on EC2 to pull latest code and restart

set -e

echo ">>> Pulling latest code..."
cd /var/www/el-templo
git pull origin master

echo ">>> Installing API dependencies..."
cd el-templo-api
pnpm install

echo ">>> Building API..."
pnpm build

echo ">>> Running migrations..."
NODE_ENV=production pnpm db:push

echo ">>> Restarting API..."
pm2 restart eltemplo-api

echo ">>> Done! Check status with: pm2 status"
