# El Templo Deployment Guide

Complete guide for deploying El Templo API to AWS EC2 and building Android APK.

**Last updated:** 2026-01-30
**Region:** sa-east-1 (São Paulo)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [AWS Infrastructure Setup](#aws-infrastructure-setup)
3. [EC2 Server Setup](#ec2-server-setup)
4. [Deploy API](#deploy-api)
5. [Build Android APK](#build-android-apk)
6. [Troubleshooting](#troubleshooting)
7. [Quick Reference](#quick-reference)

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
| Load AWS vars | `source deploy/.aws-vars` |
| SSH to server | `ssh -i ~/.ssh/eltemplo-key.pem ubuntu@$PUBLIC_IP` |
| View API logs | `pm2 logs eltemplo-api` |
| Restart API | `pm2 restart eltemplo-api` |
| Nginx logs | `sudo tail -f /var/log/nginx/error.log` |
| MySQL shell | `mysql -u eltemplo -p eltemplo` |
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
