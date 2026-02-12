# El Templo Deployment Guide

Complete guide for deploying El Templo to AWS EC2 with subdomain architecture: member app (`app.eltemplo.org`), admin app (`admin.eltemplo.org`), and API (`api.eltemplo.org`).

**Last updated:** 2026-02-12
**Region:** sa-east-1 (Sao Paulo)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [AWS Infrastructure Setup](#aws-infrastructure-setup)
3. [EC2 Server Setup](#ec2-server-setup)
4. [Subdomain & SSL Setup](#subdomain--ssl-setup)
5. [Deploy API](#deploy-api)
6. [Build Android APK](#build-android-apk)
7. [Troubleshooting](#troubleshooting)
8. [Quick Reference](#quick-reference)

---

## Prerequisites

### Local Machine (WSL/Ubuntu)

1. **AWS CLI v2**
   ```bash
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   aws --version
   ```

2. **Configure AWS credentials**
   ```bash
   aws configure
   # Enter: Access Key ID, Secret Access Key, Region (sa-east-1), Output (json)
   ```

3. **Node.js 22+ (via nvm)**
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install 22
   nvm use 22
   ```

4. **pnpm**
   ```bash
   npm install -g pnpm
   ```

5. **Java 21 (for Android builds)**
   ```bash
   sudo apt install openjdk-21-jdk -y
   echo 'export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64' >> ~/.bashrc
   source ~/.bashrc
   ```

6. **Android SDK (command-line tools)**
   ```bash
   mkdir -p ~/android-sdk/cmdline-tools
   cd ~/android-sdk/cmdline-tools
   wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
   unzip commandlinetools-linux-11076708_latest.zip
   mv cmdline-tools latest

   echo 'export ANDROID_HOME=$HOME/android-sdk' >> ~/.bashrc
   echo 'export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools' >> ~/.bashrc
   source ~/.bashrc

   sdkmanager --licenses
   sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
   ```

---

## AWS Infrastructure Setup

### Set Region
```bash
export AWS_DEFAULT_REGION=sa-east-1
```

### Use Default VPC (Simplest)
```bash
# Get default VPC
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query 'Vpcs[0].VpcId' --output text)
echo "VPC: $VPC_ID"

# Get a subnet
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query 'Subnets[0].SubnetId' --output text)
echo "Subnet: $SUBNET_ID"
```

### Create Security Group
```bash
SG_ID=$(aws ec2 create-security-group --group-name eltemplo-sg --description "El Templo API" --vpc-id $VPC_ID --query 'GroupId' --output text)
echo "Security Group: $SG_ID"

# Allow SSH, HTTP, HTTPS
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0
```

### Create Key Pair
```bash
aws ec2 create-key-pair --key-name eltemplo-key --query 'KeyMaterial' --output text > ~/.ssh/eltemplo-key.pem
chmod 400 ~/.ssh/eltemplo-key.pem
```

### Launch EC2 Instance
```bash
# Get Ubuntu 22.04 AMI (find one that works in your region)
AMI_ID=ami-013a8384b75a08b8d  # Ubuntu 22.04 for sa-east-1

# Launch instance
INSTANCE_ID=$(aws ec2 run-instances --image-id $AMI_ID --instance-type t3.small --key-name eltemplo-key --subnet-id $SUBNET_ID --security-group-ids $SG_ID --associate-public-ip-address --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=eltemplo-api}]' --query 'Instances[0].InstanceId' --output text)
echo "Instance: $INSTANCE_ID"

# Wait for running
aws ec2 wait instance-running --instance-ids $INSTANCE_ID
```

### Allocate Elastic IP (Permanent IP)
```bash
EIP_ALLOC=$(aws ec2 allocate-address --domain vpc --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=eltemplo-eip}]' --query 'AllocationId' --output text)
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $EIP_ALLOC

PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids $EIP_ALLOC --query 'Addresses[0].PublicIp' --output text)
echo "Elastic IP: $PUBLIC_IP"
```

### Save Variables
Update `deploy/.aws-vars` with your actual values:
```bash
export AWS_DEFAULT_REGION=sa-east-1
export VPC_ID=vpc-xxxxx
export SUBNET_ID=subnet-xxxxx
export SG_ID=sg-xxxxx
export AMI_ID=ami-xxxxx
export INSTANCE_ID=i-xxxxx
export PUBLIC_IP=xx.xx.xx.xx
export KEY_PATH=~/.ssh/eltemplo-key.pem
```

---

## EC2 Server Setup

### Connect to EC2
```bash
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@$PUBLIC_IP
```

### Upload and Run Setup Script
```bash
# From local machine
scp -i ~/.ssh/eltemplo-key.pem deploy/setup-ec2.sh ubuntu@$PUBLIC_IP:/home/ubuntu/

# On EC2
chmod +x setup-ec2.sh
sed -i 's/\r$//' setup-ec2.sh  # Fix Windows line endings if needed
sudo ./setup-ec2.sh
sudo reboot
```

The setup script installs:
- Node.js 22
- MySQL 8
- Nginx
- PM2
- pnpm

### Create MySQL Database
```bash
# SSH into EC2
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@$PUBLIC_IP

# Create database and user
sudo mysql
```

```sql
CREATE DATABASE eltemplo;
CREATE USER 'eltemplo'@'localhost' IDENTIFIED BY 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON eltemplo.* TO 'eltemplo'@'localhost';
FLUSH PRIVILEGES;
exit
```

---

## Subdomain & SSL Setup

This section covers setting up 3 subdomains (`app.eltemplo.org`, `admin.eltemplo.org`, `api.eltemplo.org`) with DNS, Nginx, and SSL certificates.

### 1. Configure DNS at GoDaddy

1. Log in to GoDaddy at https://dcc.godaddy.com
2. Click "My Products" or "Domain Portfolio"
3. Find `eltemplo.org` and click "DNS" (or "Manage DNS")
4. You'll see the existing DNS records (root domain pointing to Vercel)

For EACH of these 3 subdomains, add an A record:

**Subdomain 1: app**

5. Click "Add New Record"
6. Type: **A**
7. Name: **app** (NOT the full domain, just the prefix)
8. Value: **54.21.0.171**
9. TTL: 1 Hour (default is fine)
10. Click "Save"

**Subdomain 2: admin**

11. Click "Add New Record"
12. Type: **A**
13. Name: **admin**
14. Value: **54.21.0.171**
15. TTL: 1 Hour
16. Click "Save"

**Subdomain 3: api**

17. Click "Add New Record"
18. Type: **A**
19. Name: **api**
20. Value: **54.21.0.171**
21. TTL: 1 Hour
22. Click "Save"

**Verify DNS propagation** (wait 10-30 minutes after adding records):

```bash
dig app.eltemplo.org +short      # Should return 54.21.0.171
dig admin.eltemplo.org +short    # Should return 54.21.0.171
dig api.eltemplo.org +short      # Should return 54.21.0.171
```

### 2. Create Server Directories

```bash
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171

# Create directories for static app files
sudo mkdir -p /var/www/member-app
sudo mkdir -p /var/www/admin-app
sudo chown -R ubuntu:ubuntu /var/www/member-app
sudo chown -R ubuntu:ubuntu /var/www/admin-app
```

### 3. Deploy Nginx Subdomain Configs

```bash
# From local machine (project root)
scp -i ~/.ssh/eltemplo-key.pem deploy/nginx/* ubuntu@54.21.0.171:/tmp/

# On the EC2 server
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171

# Backup old config
sudo cp /etc/nginx/sites-enabled/eltemplo /etc/nginx/sites-available/eltemplo.bak 2>/dev/null

# Remove old catch-all config (CRITICAL: it has server_name _ which intercepts all traffic)
sudo rm -f /etc/nginx/sites-enabled/eltemplo

# Install new subdomain configs
sudo cp /tmp/app.eltemplo.org /etc/nginx/sites-available/
sudo cp /tmp/admin.eltemplo.org /etc/nginx/sites-available/
sudo cp /tmp/api.eltemplo.org /etc/nginx/sites-available/

# Enable configs
sudo ln -sf /etc/nginx/sites-available/app.eltemplo.org /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/admin.eltemplo.org /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/api.eltemplo.org /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Install Certbot & Obtain SSL Certificates

```bash
# On the EC2 server
# Install certbot via snap (EFF-recommended method)
sudo snap install core && sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Obtain certificate for all 3 subdomains
# IMPORTANT: DNS must be propagated before this step (verify with dig first)
# The --nginx plugin automatically:
#   - Finds matching server blocks
#   - Obtains certificate via HTTP-01 challenge
#   - Adds SSL directives to server blocks
#   - Creates HTTP->HTTPS redirect blocks
sudo certbot --nginx \
  -d app.eltemplo.org \
  -d admin.eltemplo.org \
  -d api.eltemplo.org \
  --non-interactive \
  --agree-tos \
  --email admin@eltemplo.org

# Verify auto-renewal timer is active
sudo systemctl status certbot.timer

# Test renewal (dry-run)
sudo certbot renew --dry-run
```

### 5. Add/Update GitHub Secrets

Go to GitHub repository Settings > Secrets and variables > Actions.

**New secrets to ADD:**

| Secret | Value |
|--------|-------|
| `ADMIN_DEPLOY_PATH` | `/var/www/admin-app` |
| `ADMIN_URL` | `https://admin.eltemplo.org` |

**Existing secrets to UPDATE:**

| Secret | New Value | Old Value |
|--------|-----------|-----------|
| `VITE_API_URL` | `https://api.eltemplo.org/api` | (was IP-based HTTP URL) |
| `FRONTEND_URL` | `https://app.eltemplo.org` | (was IP-based HTTP URL) |
| `APP_DEPLOY_PATH` | `/var/www/member-app` | (was `/var/www/el-templo-app` or similar) |

### 6. Verify Deployment

After pushing code changes and secrets are configured:

```bash
# Trigger a deploy (push to master or manual trigger in GitHub Actions)

# Verify HTTPS on all subdomains:
curl -I https://app.eltemplo.org        # Should return 200 with index.html
curl -I https://admin.eltemplo.org      # Should return 200 with index.html
curl https://api.eltemplo.org/health    # Should return {"status":"ok",...}

# Verify HTTP->HTTPS redirect:
curl -I http://app.eltemplo.org         # Should return 301 -> https://
curl -I http://admin.eltemplo.org       # Should return 301 -> https://
curl -I http://api.eltemplo.org         # Should return 301 -> https://

# Verify CORS (from admin subdomain to API):
curl -H "Origin: https://admin.eltemplo.org" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://api.eltemplo.org/api/admin/sessions \
     -I
# Should include: Access-Control-Allow-Origin: https://admin.eltemplo.org
```

---

## Deploy API

### Clone Repository
```bash
cd /var/www
sudo git clone https://github.com/YOUR_USERNAME/el-templo.git
sudo chown -R ubuntu:ubuntu el-templo
cd el-templo/el-templo-api
```

**Note:** If repo is private, temporarily make it public to clone, then make private again. Or use a Personal Access Token.

### Configure Environment
```bash
# Generate JWT secret
openssl rand -base64 64

# Edit production environment
nano .env.production
```

Set these values:
```
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=eltemplo
DB_PASSWORD=YOUR_DB_PASSWORD
DB_NAME=eltemplo
JWT_SECRET=YOUR_GENERATED_SECRET
FRONTEND_URL=http://YOUR_ELASTIC_IP
```

Create symlink so drizzle finds the env:
```bash
ln -s .env.production .env
```

### Install, Build, Seed
```bash
pnpm install
pnpm build
pnpm db:push
pnpm db:seed
pnpm seed:spom
```

### Start with PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Run the command it outputs
```

### Configure Nginx
```bash
sudo cp /var/www/el-templo/deploy/nginx.conf /etc/nginx/sites-available/eltemplo
sudo ln -s /etc/nginx/sites-available/eltemplo /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Verify
```bash
curl http://localhost/health
# Should return: {"status":"ok","timestamp":"..."}
```

From local machine:
```bash
curl http://YOUR_ELASTIC_IP/health
```

---

## Build Android APK

### Update Frontend Config
Edit `el-templo-app/.env.production`:
```
VITE_API_URL=http://YOUR_ELASTIC_IP/api
VITE_APP_NAME=El Templo
```

### Fix local.properties (WSL)
```bash
echo "sdk.dir=$HOME/android-sdk" > el-templo-app/src-capacitor/android/local.properties
```

### Build
```bash
cd el-templo-app
pnpm build -m capacitor -T android
```

If the release APK is unsigned, build debug instead:
```bash
cd src-capacitor/android
./gradlew assembleDebug
```

### Find APK
```bash
ls -la src-capacitor/android/app/build/outputs/apk/debug/
# app-debug.apk
```

### Install on Phone
1. Enable "Install from unknown sources" on phone
2. Transfer `app-debug.apk` to phone (USB, Google Drive, etc.)
3. Open and install

---

## Troubleshooting

### SSH Connection Refused
- Wait 30 seconds after instance launch
- Check security group allows port 22
- Verify key permissions: `chmod 400 ~/.ssh/eltemplo-key.pem`

### API Not Responding
```bash
pm2 status           # Check if running
pm2 logs             # Check for errors
curl localhost:3000/health  # Test directly
```

### MySQL Access Denied
```bash
# Reset user
sudo mysql
DROP USER 'eltemplo'@'localhost';
CREATE USER 'eltemplo'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON eltemplo.* TO 'eltemplo'@'localhost';
FLUSH PRIVILEGES;
```

### Nginx 502 Bad Gateway
- API not running: `pm2 restart eltemplo-api`
- Check logs: `sudo tail -f /var/log/nginx/error.log`

### Gradle Build Fails
- Clear caches: `rm -rf ~/.gradle`
- Check Java version: `java --version` (needs 21+)
- Check Android SDK: `echo $ANDROID_HOME`

### APK Won't Install
- Use debug build instead of release (unsigned)
- Enable "Install unknown apps" on phone

---

## Quick Reference

| Task | Command |
|------|---------|
| Member app | `https://app.eltemplo.org` |
| Admin app | `https://admin.eltemplo.org` |
| API health | `curl https://api.eltemplo.org/health` |
| Load AWS vars | `source deploy/.aws-vars` |
| SSH to server | `ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171` |
| View API logs | `pm2 logs eltemplo-api` |
| Restart API | `pm2 restart eltemplo-api` |
| Nginx config test | `sudo nginx -t` |
| Nginx logs | `sudo tail -f /var/log/nginx/error.log` |
| MySQL shell | `mysql -u eltemplo -p eltemplo` |
| Cert renewal test | `sudo certbot renew --dry-run` |
| Build APK | `pnpm build -m capacitor -T android` |
| Debug APK | `cd src-capacitor/android && ./gradlew assembleDebug` |

---

## AWS Resource Summary

| Resource | ID | Notes |
|----------|-----|-------|
| Region | sa-east-1 | São Paulo |
| VPC | vpc-039f68f9a2773ca2c | Default VPC |
| Subnet | subnet-08acca90e0e855a01 | Default subnet |
| Security Group | sg-0c2a00f72b8002cf9 | Ports 22, 80, 443 |
| EC2 Instance | i-089146d75af41fc62 | t3.small, Ubuntu 22.04 |
| Elastic IP | 54.21.0.171 | Permanent IP |
| Key Pair | eltemplo-key | ~/.ssh/eltemplo-key.pem |

---

## Costs (Estimated)

| Resource | Monthly Cost |
|----------|--------------|
| EC2 t3.small | ~$15 |
| EBS 20GB gp3 | ~$1.60 |
| Elastic IP | Free (while attached) |
| Data transfer | First 100GB free |
| **Total** | **~$17/month** |

---

## Cleanup (Delete Everything)

```bash
source deploy/.aws-vars

# Terminate instance
aws ec2 terminate-instances --instance-ids $INSTANCE_ID
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID

# Release Elastic IP
EIP_ALLOC=$(aws ec2 describe-addresses --filters "Name=public-ip,Values=$PUBLIC_IP" --query 'Addresses[0].AllocationId' --output text)
aws ec2 release-address --allocation-id $EIP_ALLOC

# Delete security group
aws ec2 delete-security-group --group-id $SG_ID

# Delete key pair
aws ec2 delete-key-pair --key-name eltemplo-key
rm ~/.ssh/eltemplo-key.pem
```
