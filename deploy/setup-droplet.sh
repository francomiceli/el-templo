#!/bin/bash
# El Templo - Droplet Setup Script
# Run as root on a fresh Ubuntu 24.04 droplet

set -e  # Exit on error

echo "=========================================="
echo "El Templo - Server Setup"
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

# Secure MySQL - start service first
systemctl start mysql
systemctl enable mysql

# Configure MySQL for local access only
echo ">>> Configuring MySQL..."
mysql -u root << 'EOF'
-- Set root password and secure installation
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root_temp_password_change_me';

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

# Configure firewall
echo ">>> Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Start Nginx
echo ">>> Starting Nginx..."
systemctl start nginx
systemctl enable nginx

# Create deploy user (optional but recommended)
echo ">>> Creating deploy user..."
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash deploy
    usermod -aG sudo deploy
    mkdir -p /home/deploy/.ssh
    cp /root/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys 2>/dev/null || true
fi

# Give deploy user access to /var/www
chown -R deploy:deploy /var/www

# Create PM2 log directory
mkdir -p /var/log/pm2
chown -R deploy:deploy /var/log/pm2

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Change MySQL root password:"
echo "   mysql -u root -p'root_temp_password_change_me'"
echo "   ALTER USER 'root'@'localhost' IDENTIFIED BY 'YOUR_NEW_SECURE_PASSWORD';"
echo ""
echo "2. Create database and user:"
echo "   mysql -u root -p"
echo "   CREATE DATABASE eltemplo;"
echo "   CREATE USER 'eltemplo'@'localhost' IDENTIFIED BY 'YOUR_DB_PASSWORD';"
echo "   GRANT ALL PRIVILEGES ON eltemplo.* TO 'eltemplo'@'localhost';"
echo "   FLUSH PRIVILEGES;"
echo ""
echo "3. Clone your repository:"
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
