# El Templo Deployment Checklist (AWS)

## Overview

Deploy El Templo API to AWS EC2 (sa-east-1) + build Android APK for testing.

**Architecture:**
```
Your Phone (APK) --> EC2 Instance (sa-east-1) --> MySQL (same instance)
                         |
                     Nginx (port 80)
                         |
                     PM2 + Node.js (port 3000)
```

---

## Phase 1: AWS Infrastructure (CLI commands)

### 1.1 Set Region
```bash
export AWS_DEFAULT_REGION=sa-east-1
```

### 1.2 Create VPC & Networking
```bash
# Create VPC
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=eltemplo-vpc}]' \
  --query 'Vpc.VpcId' --output text)
echo "VPC: $VPC_ID"

# Enable DNS hostnames
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames

# Create Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=eltemplo-igw}]' \
  --query 'InternetGateway.InternetGatewayId' --output text)
echo "IGW: $IGW_ID"

# Attach IGW to VPC
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID

# Create Public Subnet
SUBNET_ID=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone sa-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=eltemplo-public}]' \
  --query 'Subnet.SubnetId' --output text)
echo "Subnet: $SUBNET_ID"

# Enable auto-assign public IP
aws ec2 modify-subnet-attribute --subnet-id $SUBNET_ID --map-public-ip-on-launch

# Create Route Table
RTB_ID=$(aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=eltemplo-rtb}]' \
  --query 'RouteTable.RouteTableId' --output text)
echo "Route Table: $RTB_ID"

# Add route to Internet
aws ec2 create-route --route-table-id $RTB_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID

# Associate route table with subnet
aws ec2 associate-route-table --subnet-id $SUBNET_ID --route-table-id $RTB_ID
```

### 1.3 Create Security Group
```bash
# Create Security Group
SG_ID=$(aws ec2 create-security-group \
  --group-name eltemplo-sg \
  --description "El Templo API security group" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)
echo "Security Group: $SG_ID"

# Allow SSH (port 22)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0

# Allow HTTP (port 80)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0

# Allow HTTPS (port 443) - for later
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0
```

### 1.4 Create Key Pair (if you don't have one)
```bash
aws ec2 create-key-pair \
  --key-name eltemplo-key \
  --query 'KeyMaterial' --output text > ~/.ssh/eltemplo-key.pem

chmod 400 ~/.ssh/eltemplo-key.pem
```

### 1.5 Launch EC2 Instance
```bash
# Get latest Ubuntu 24.04 AMI for sa-east-1
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' --output text)
echo "AMI: $AMI_ID"

# Launch instance (t3.small recommended, t3.micro for free tier)
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.small \
  --key-name eltemplo-key \
  --subnet-id $SUBNET_ID \
  --security-group-ids $SG_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=eltemplo-api}]' \
  --query 'Instances[0].InstanceId' --output text)
echo "Instance: $INSTANCE_ID"

# Wait for instance to be running
aws ec2 wait instance-running --instance-ids $INSTANCE_ID
```

### 1.6 Allocate Elastic IP
```bash
# Allocate Elastic IP
EIP_ALLOC=$(aws ec2 allocate-address \
  --domain vpc \
  --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=eltemplo-eip}]' \
  --query 'AllocationId' --output text)

# Associate with instance
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id $EIP_ALLOC

# Get the public IP
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids $EIP_ALLOC --query 'Addresses[0].PublicIp' --output text)
echo "=========================================="
echo "YOUR SERVER IP: $PUBLIC_IP"
echo "=========================================="
```

### 1.7 Save Your Variables
```bash
# Save for later reference
cat << EOF > ~/.eltemplo-aws-vars
export VPC_ID=$VPC_ID
export SUBNET_ID=$SUBNET_ID
export SG_ID=$SG_ID
export INSTANCE_ID=$INSTANCE_ID
export PUBLIC_IP=$PUBLIC_IP
EOF
echo "Variables saved to ~/.eltemplo-aws-vars"
```

---

## Phase 2: Server Setup

### 2.1 Connect to EC2
```bash
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@$PUBLIC_IP
```

### 2.2 Upload and Run Setup Script
```bash
# From your local machine:
scp -i ~/.ssh/eltemplo-key.pem deploy/setup-ec2.sh ubuntu@$PUBLIC_IP:/home/ubuntu/

# On the EC2 instance:
chmod +x /home/ubuntu/setup-ec2.sh
sudo /home/ubuntu/setup-ec2.sh
```

### 2.3 Create MySQL Database
```bash
sudo mysql << EOF
CREATE DATABASE eltemplo;
CREATE USER 'eltemplo'@'localhost' IDENTIFIED BY 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON eltemplo.* TO 'eltemplo'@'localhost';
FLUSH PRIVILEGES;
EOF
```

---

## Phase 3: Deploy API

### 3.1 Clone Repository
```bash
cd /var/www
sudo git clone https://github.com/YOUR_USERNAME/el-templo.git
sudo chown -R ubuntu:ubuntu el-templo
cd el-templo/el-templo-api
```

### 3.2 Configure Environment
```bash
cp .env.production .env.production.bak  # backup
nano .env.production
# Fill in:
#   DB_HOST=localhost
#   DB_USER=eltemplo
#   DB_PASSWORD=YOUR_SECURE_PASSWORD
#   DB_NAME=eltemplo
#   JWT_SECRET=<generate with: openssl rand -base64 64>
#   FRONTEND_URL=http://YOUR_PUBLIC_IP
```

### 3.3 Install & Build
```bash
pnpm install
pnpm build
```

### 3.4 Run Migrations & Seed
```bash
NODE_ENV=production pnpm db:push
NODE_ENV=production pnpm db:seed
NODE_ENV=production pnpm seed:spom
```

### 3.5 Start with PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

### 3.6 Configure Nginx
```bash
sudo cp /var/www/el-templo/deploy/nginx.conf /etc/nginx/sites-available/eltemplo
sudo ln -s /etc/nginx/sites-available/eltemplo /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site
sudo nginx -t
sudo systemctl reload nginx
```

### 3.7 Test API
```bash
curl http://localhost/api/health
# Should return: {"status":"ok"}
```

---

## Phase 4: Build Android APK

### 4.1 Update API URL (local machine)
Edit `el-templo-app/.env.production`:
```bash
VITE_API_URL=http://YOUR_PUBLIC_IP
```

### 4.2 Build Web Assets
```bash
cd el-templo-app
pnpm build -m capacitor
```

### 4.3 Sync to Android
```bash
npx cap sync android
```

### 4.4 Build APK
Option A - Android Studio:
```bash
npx cap open android
# Build → Build Bundle(s)/APK(s) → Build APK(s)
```

Option B - Command line:
```bash
cd src-capacitor/android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

### 4.5 Install on Phone
Transfer APK to phone and install, or:
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## Phase 5: Verification

- [ ] API responds at `http://YOUR_PUBLIC_IP/api/health`
- [ ] App opens on phone
- [ ] Can register new user
- [ ] Can log in
- [ ] Sessions load correctly

---

## Quick Reference

| What | Command |
|------|---------|
| SSH to server | `ssh -i ~/.ssh/eltemplo-key.pem ubuntu@$PUBLIC_IP` |
| View API logs | `pm2 logs eltemplo-api` |
| Restart API | `pm2 restart eltemplo-api` |
| View Nginx logs | `sudo tail -f /var/log/nginx/error.log` |
| MySQL shell | `mysql -u eltemplo -p eltemplo` |
| Load AWS vars | `source ~/.eltemplo-aws-vars` |

---

## Cleanup (when done testing)

```bash
# Load variables
source ~/.eltemplo-aws-vars

# Terminate instance
aws ec2 terminate-instances --instance-ids $INSTANCE_ID

# Wait for termination
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID

# Release Elastic IP
EIP_ALLOC=$(aws ec2 describe-addresses --filters "Name=public-ip,Values=$PUBLIC_IP" --query 'Addresses[0].AllocationId' --output text)
aws ec2 release-address --allocation-id $EIP_ALLOC

# Delete security group
aws ec2 delete-security-group --group-id $SG_ID

# Delete subnet
aws ec2 delete-subnet --subnet-id $SUBNET_ID

# Delete route table
aws ec2 delete-route-table --route-table-id $RTB_ID

# Detach and delete internet gateway
aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID
aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID

# Delete VPC
aws ec2 delete-vpc --vpc-id $VPC_ID
```
