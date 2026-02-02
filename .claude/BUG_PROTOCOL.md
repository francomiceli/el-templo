# Bug Intervention Protocol

When user reports "app buggy" or similar issues, follow these steps:

## 1. Check Server Logs

```bash
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'pm2 logs eltemplo-api --lines 100 --nostream'
```

## 2. Common Issues & Quick Fixes

### MySQL Connection Closed
**Error:** `Can't add new command when connection is in closed state`
**Quick fix:** Restart PM2
```bash
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'pm2 restart eltemplo-api'
```

### 500 Errors
Check the error stack in logs to identify the failing route/query.

## 3. Check Nginx Logs

```bash
# Access logs
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'tail -50 /var/log/nginx/access.log'

# Error logs
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'tail -50 /var/log/nginx/error.log'
```

## 4. Database Access

```bash
# Connect to MySQL on server
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'mysql -u eltemplo -p12templodbu0ni12 eltemplo'

# Quick queries
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'mysql -u eltemplo -p12templodbu0ni12 eltemplo -e "SELECT * FROM users LIMIT 5;"'
```

## 5. Deploy a Fix

After fixing code locally:

```bash
# Build locally
cd /home/franco/projects/el-templo/el-templo-api
pnpm build

# Upload changed files (example for a single file)
scp -i ~/.ssh/eltemplo-key.pem dist/path/to/file.js ubuntu@54.21.0.171:/var/www/el-templo/el-templo-api/dist/path/to/file.js

# Or for full deploy via git (requires commit first)
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'cd /var/www/el-templo && ./deploy/update-server.sh'

# Restart after deploy
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'pm2 restart eltemplo-api'
```

## 6. Verify Fix

```bash
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 'pm2 logs eltemplo-api --lines 20 --nostream'
```

## 7. Server Details

- **IP:** 54.21.0.171
- **SSH Key:** ~/.ssh/eltemplo-key.pem
- **User:** ubuntu
- **App Path:** /var/www/el-templo
- **PM2 App Name:** eltemplo-api
- **Logs:** /var/log/pm2/eltemplo-api-*.log
