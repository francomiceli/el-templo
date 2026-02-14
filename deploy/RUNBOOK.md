# El Templo - Production Incident Runbook

Reference guide for handling common production incidents. Designed for the solo developer to follow under pressure when something breaks.

**Server:** Ubuntu 22.04 on AWS EC2 (t3.small, sa-east-1)
**Last updated:** 2026-02-14

---

## 1. Quick Reference

```bash
# SSH into server
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@<SERVER_IP>

# PM2 (API process manager)
pm2 status                           # Check running processes
pm2 restart eltemplo-api             # Restart API
pm2 logs eltemplo-api --lines 50     # Recent logs
pm2 monit                            # Real-time CPU/memory

# Nginx (reverse proxy + static files)
sudo systemctl status nginx          # Check Nginx status
sudo nginx -t                        # Test config syntax
sudo systemctl reload nginx          # Reload config (no downtime)
sudo systemctl restart nginx         # Full restart

# MySQL
sudo systemctl status mysql          # Check MySQL status
sudo systemctl restart mysql         # Restart MySQL
mysql -u root -p                     # MySQL shell

# System
df -h                                # Disk space
htop                                 # CPU/memory overview
free -h                              # Memory summary
```

**Domains:**

- Member app: `app.eltemplo.org`
- Admin app: `admin.eltemplo.org`
- API: `api.eltemplo.org`

---

## 2. API Down (HTTP 502/503)

**Symptoms:** Browser shows 502 Bad Gateway or 503 Service Unavailable.

**Step 1: Check if API process is running**

```bash
pm2 status
```

- If `eltemplo-api` shows `stopped` or `errored`, go to Step 2.
- If it shows `online`, check logs (Step 3).

**Step 2: Restart the API**

```bash
pm2 restart eltemplo-api --update-env
```

Wait 5 seconds, then check:

```bash
curl -s http://localhost:3000/health
```

If healthy, done. If not, continue.

**Step 3: Check API logs for errors**

```bash
pm2 logs eltemplo-api --lines 50
```

Look for: database connection errors, missing env vars, uncaught exceptions.

**Step 4: Check if port is already in use**

```bash
sudo lsof -i :3000
```

If another process holds port 3000, kill it:

```bash
sudo kill -9 <PID>
pm2 restart eltemplo-api
```

**Step 5: Nuclear option (full redeploy)**

```bash
pm2 delete eltemplo-api
cd /path/to/api
pnpm install --prod --frozen-lockfile
NODE_ENV=production pm2 start dist/index.js --name eltemplo-api
```

---

## 3. Database Connection Lost

**Symptoms:** API logs show `ECONNREFUSED`, `ER_ACCESS_DENIED_ERROR`, or `Connection lost`.

**Step 1: Check MySQL status**

```bash
sudo systemctl status mysql
```

**Step 2: Restart MySQL if stopped**

```bash
sudo systemctl restart mysql
```

**Step 3: Restart API to reconnect**

```bash
pm2 restart eltemplo-api
```

The API creates a new connection pool on startup.

**Step 4: Check disk space**

```bash
df -h
```

MySQL crashes when disk is full. If `/` is above 90%:

```bash
# Clean old backups
find /var/backups/mysql -name "*.sql.gz" -mtime +3 -delete
# Clean old logs
sudo journalctl --vacuum-time=2d
```

**Step 5: Check MySQL error logs**

```bash
sudo tail -50 /var/log/mysql/error.log
```

**Step 6: Verify credentials**

```bash
# Test connection with API credentials
mysql -u root -p -e "SELECT 1;"
```

If credentials changed, update the `.env.production` file and restart the API.

---

## 4. App Not Loading (Frontend)

**Symptoms:** Browser shows blank page, "Cannot GET /", or Nginx error.

**Step 1: Check Nginx**

```bash
sudo nginx -t && sudo systemctl status nginx
```

If config test fails, check the error and fix the Nginx config.

**Step 2: Check if frontend files exist**

```bash
ls -la /path/to/app/dist/
ls -la /path/to/admin/dist/
```

If files are missing, a deploy may have failed. Check GitHub Actions.

**Step 3: Check Nginx error log**

```bash
sudo tail -50 /var/log/nginx/error.log
```

**Step 4: Hard refresh for users**
Tell users to clear browser cache: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac).
Old cached JavaScript chunks from a previous deploy can cause loading errors.

**Step 5: If corrupted deploy, rollback**

```bash
# Restore previous app version
if [ -d "/path/to/app.previous" ]; then
  rm -rf /path/to/app
  mv /path/to/app.previous /path/to/app
fi
sudo systemctl reload nginx
```

---

## 5. Failed Deploy

**Symptoms:** GitHub Actions deploy workflow failed, or app broken after deploy.

**Step 1: Check CI/CD**
The deploy pipeline runs a post-deploy health check (`GET /health`). If the health check fails, it auto-rolls back the API, App, and Admin to `.previous` directories.

Review the failed workflow at: `https://github.com/<org>/el-templo/actions`

**Step 2: Manual rollback (if auto-rollback didn't run)**

```bash
# On the server:

# Restore API
if [ -d "/path/to/api.previous" ]; then
  rm -rf /path/to/api
  mv /path/to/api.previous /path/to/api
  cd /path/to/api
  pnpm install --prod --frozen-lockfile
  pm2 restart eltemplo-api --update-env
fi

# Restore App
if [ -d "/path/to/app.previous" ]; then
  rm -rf /path/to/app
  mv /path/to/app.previous /path/to/app
fi

# Restore Admin
if [ -d "/path/to/admin.previous" ]; then
  rm -rf /path/to/admin
  mv /path/to/admin.previous /path/to/admin
fi

sudo systemctl reload nginx
```

**Step 3: Investigate the root cause**

- Check GitHub Actions logs for the specific step that failed
- Common causes: build errors, type errors, test failures, SSH connection timeout
- Fix the issue in code, push again to trigger a new deploy

---

## 6. Database Corruption / Data Loss

**Symptoms:** Missing data, API errors on queries, MySQL table corruption.

**Step 1: Stop the API immediately**

```bash
pm2 stop eltemplo-api
```

This prevents further writes to a corrupted database.

**Step 2: Find the latest backup**

```bash
ls -la /var/backups/mysql/eltemplo_*.sql.gz
```

Backups are named with timestamps: `eltemplo_YYYYMMDD_HHMMSS.sql.gz`

**Step 3: Restore from backup**

```bash
./deploy/restore.sh /var/backups/mysql/eltemplo_LATEST.sql.gz
```

The restore script has a 5-second safety countdown. It decompresses and pipes to MySQL.

**Step 4: Restart the API**

```bash
pm2 restart eltemplo-api
```

**Step 5: If no local backup exists**
Download from cloud storage (AWS S3):

```bash
aws s3 ls s3://eltemplo-backups/ | tail -5
aws s3 cp s3://eltemplo-backups/eltemplo_LATEST.sql.gz /var/backups/mysql/
./deploy/restore.sh /var/backups/mysql/eltemplo_LATEST.sql.gz
```

**Step 6: Run pending migrations**
If restoring an older backup, re-run migrations to bring schema up to date:

```bash
cd /path/to/api
NODE_ENV=production node dist/db/run-migrations.js
pm2 restart eltemplo-api
```

---

## 7. SSL Certificate Expired

**Symptoms:** Browser shows "Your connection is not private" or `ERR_CERT_DATE_INVALID`.

**Step 1: Check certificate status**

```bash
sudo certbot certificates
```

**Step 2: Renew certificates**

```bash
sudo certbot renew
```

**Step 3: Reload Nginx**

```bash
sudo systemctl reload nginx
```

**Step 4: Verify renewal**

```bash
echo | openssl s_client -servername app.eltemplo.org -connect app.eltemplo.org:443 2>/dev/null | openssl x509 -noout -dates
```

**Prevention:** Certbot auto-renewal runs via systemd timer. Verify it's active:

```bash
sudo systemctl status certbot.timer
```

---

## 8. High Memory / CPU Usage

**Symptoms:** Server slow, SSH connections dropping, API timeouts.

**Step 1: Identify the culprit**

```bash
htop
```

Sort by CPU (`P`) or Memory (`M`).

**Step 2: Check PM2 resource usage**

```bash
pm2 monit
```

**Step 3: If API is leaking memory**

```bash
pm2 restart eltemplo-api
```

If it happens repeatedly, check recent code changes for:

- Unbounded arrays/caches
- Event listeners not being removed
- Large query results not being streamed

**Step 4: If MySQL is using too much memory**

```bash
# Check active connections
mysql -u root -p -e "SHOW PROCESSLIST;"
# Kill long-running queries
mysql -u root -p -e "KILL <process_id>;"
```

**Step 5: Emergency: free memory**

```bash
# Clear system caches (safe)
sudo sync && sudo sysctl -w vm.drop_caches=3
```

---

## 9. Secret Rotation Procedure

Rotate secrets periodically or if a breach is suspected.

### JWT Secret

1. Generate new secret:
   ```bash
   openssl rand -base64 32
   ```
2. Update in GitHub repository secrets (`Settings > Secrets > Actions > JWT_SECRET`)
3. Update in server `.env.production` file
4. Deploy (push to master or manual workflow trigger)
5. **Impact:** All users will need to re-authenticate (existing tokens become invalid)

### Database Password

1. Update MySQL password first:
   ```bash
   mysql -u root -p
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'NEW_PASSWORD_HERE';
   FLUSH PRIVILEGES;
   ```
2. Update `.env.production` on the server with the new `DB_PASSWORD`
3. Update GitHub secrets (`DB_PASSWORD`)
4. Restart API: `pm2 restart eltemplo-api`
5. **Verify:** `curl http://localhost:3000/health`

### SSH Key

1. Generate new key pair locally
2. Add new public key to server `~/.ssh/authorized_keys`
3. Update GitHub secret `SSH_PRIVATE_KEY` with new private key
4. Test SSH connection
5. Remove old public key from server

**General rules:**

- Never rotate during peak hours (early morning Argentina time is safest)
- Test the new credentials immediately after rotation
- Keep a backup of old credentials for 24 hours in case of issues

---

## 10. Backup Verification

### Monthly Verification Procedure

Restore a backup to a test database and verify data integrity:

```bash
# Create test database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS eltemplo_test_restore;"

# Restore latest backup to test DB
DB_NAME=eltemplo_test_restore ./deploy/restore.sh /var/backups/mysql/eltemplo_LATEST.sql.gz

# Verify data exists
mysql -u root -p eltemplo_test_restore -e "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM sessions;"

# Clean up
mysql -u root -p -e "DROP DATABASE eltemplo_test_restore;"
```

### Check Cron is Running

```bash
crontab -l | grep backup
```

Expected output: `0 6 * * * /path/to/deploy/backup.sh >> /var/log/eltemplo-backup.log 2>&1`

### Check Recent Backups

```bash
ls -la /var/backups/mysql/eltemplo_*.sql.gz | tail -5
```

You should see daily backups. If missing, check the backup log:

```bash
tail -50 /var/log/eltemplo-backup.log
```

---

## Important Notes

### Database Migrations and Rollbacks

Database migrations should be **backward-compatible** (additive only):

- Adding a column: safe (old code ignores new columns)
- Adding a table: safe
- Renaming a column: **dangerous** (old code references old name)
- Dropping a column: **dangerous** (old code references it)

Rolling back API code works because old code can handle new columns/tables it doesn't know about. **Never do destructive migrations** (DROP COLUMN, RENAME COLUMN) without a multi-step process:

1. Deploy code that works with both old and new schema
2. Run migration
3. Deploy code that uses only new schema
4. (Optional) Clean up old column in a future migration

### Sentry Error Tracking

If Sentry is configured, check for errors at: `https://sentry.io/organizations/<org>/issues/`

Sentry captures:

- Unhandled exceptions in the API
- Request context (URL, method, headers)
- Stack traces with source maps

To test Sentry integration:

```bash
curl https://api.eltemplo.org/api/nonexistent-route
```

A 404 error should appear in Sentry within 1-2 minutes.

### Emergency Contacts

- **AWS Console:** https://console.aws.amazon.com (sa-east-1 region)
- **GitHub Actions:** https://github.com/<org>/el-templo/actions
- **Sentry Dashboard:** https://sentry.io
- **Domain DNS (GoDaddy):** https://dcc.godaddy.com
