#!/bin/bash
# El Templo - EC2 Setup Script
# Run as root (sudo) on a fresh Ubuntu 24.04 EC2 instance

set -e  # Exit on error

echo "=========================================="
echo "El Templo - EC2 Server Setup"
echo "=========================================="

# Update system
echo ">>> Updating system packages..."
apt update && apt upgrade -y

# Install essential tools
echo ">>> Installing essential tools..."
apt install -y curl git nginx ufw

# Install Node.js 22 LTS
echo ">>> Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Verify Node installation
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

# Install pnpm globally
echo ">>> Installing pnpm..."
npm install -g pnpm

# Install PM2
echo ">>> Installing PM2..."
npm install -g pm2

# Install MySQL 8
echo ">>> Installing MySQL..."
apt install -y mysql-server

# Start and enable MySQL
systemctl start mysql
systemctl enable mysql

# Secure MySQL installation
echo ">>> Securing MySQL..."
mysql << 'EOF'
-- Remove anonymous users
DELETE FROM mysql.user WHERE User='';

-- Disable remote root login
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');

-- Remove test database
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';

FLUSH PRIVILEGES;
EOF

# Create app directory
echo ">>> Creating app directory..."
mkdir -p /var/www
chown -R ubuntu:ubuntu /var/www

# Create PM2 log directory
mkdir -p /var/log/pm2
chown -R ubuntu:ubuntu /var/log/pm2

# Configure firewall (AWS Security Groups handle this, but good to have)
echo ">>> Configuring UFW firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Start Nginx
echo ">>> Starting Nginx..."
systemctl start nginx
systemctl enable nginx

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Create database and user:"
echo "   sudo mysql"
echo "   CREATE DATABASE eltemplo;"
echo "   CREATE USER 'eltemplo'@'localhost' IDENTIFIED BY 'YOUR_PASSWORD';"
echo "   GRANT ALL PRIVILEGES ON eltemplo.* TO 'eltemplo'@'localhost';"
echo "   FLUSH PRIVILEGES;"
echo "   exit"
echo ""
echo "2. Clone your repository:"
echo "   cd /var/www"
echo "   git clone https://github.com/YOUR_USER/el-templo.git"
echo ""
echo "Installed versions:"
echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"
echo "  pnpm: $(pnpm --version)"
echo "  PM2: $(pm2 --version)"
echo "  MySQL: $(mysql --version)"
echo "  Nginx: $(nginx -v 2>&1)"
echo ""
