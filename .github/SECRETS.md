# GitHub Secrets Configuration

This document lists all the GitHub secrets required for the CI/CD workflows.

## Required Secrets

### Server Access

| Secret            | Description                       | Example                                  |
| ----------------- | --------------------------------- | ---------------------------------------- |
| `SSH_PRIVATE_KEY` | Private SSH key for server access | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_USER`        | SSH username for deployment       | `ubuntu`                                 |
| `SERVER_HOST`     | Server IP or hostname             | `54.21.0.171`                            |

### Deployment Paths

| Secret              | Description                         | Example                  |
| ------------------- | ----------------------------------- | ------------------------ |
| `API_DEPLOY_PATH`   | Path on server for API files        | `/var/www/el-templo-api` |
| `APP_DEPLOY_PATH`   | Path on server for member app files | `/var/www/member-app`    |
| `ADMIN_DEPLOY_PATH` | Path on server for admin app files  | `/var/www/admin-app`     |

### Database Configuration

| Secret        | Description                          | Example                     |
| ------------- | ------------------------------------ | --------------------------- |
| `DB_HOST`     | MySQL host                           | `localhost` or RDS endpoint |
| `DB_PORT`     | MySQL port (optional, default: 3306) | `3306`                      |
| `DB_USER`     | MySQL username                       | `eltemplo_user`             |
| `DB_PASSWORD` | MySQL password                       | `secure-password-here`      |
| `DB_NAME`     | MySQL database name                  | `eltemplo`                  |

### Authentication

| Secret           | Description                                                          | Example              |
| ---------------- | -------------------------------------------------------------------- | -------------------- |
| `JWT_SECRET`     | Secret key for JWT signing (generate with `openssl rand -base64 64`) | `long-random-string` |
| `JWT_EXPIRES_IN` | Token expiration (optional, default: 7d)                             | `7d`                 |

### Application URLs

| Secret         | Description                      | Example                        |
| -------------- | -------------------------------- | ------------------------------ |
| `VITE_API_URL` | Full API URL for frontend builds | `https://api.eltemplo.org/api` |
| `FRONTEND_URL` | Member app URL for CORS          | `https://app.eltemplo.org`     |
| `ADMIN_URL`    | Admin app URL for CORS           | `https://admin.eltemplo.org`   |

### Android Signing (Play Store)

| Secret                      | Description                                                        | Example                                |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded upload keystore file (.keystore)                    | `MIIKfAIBAzCC...` (long base64 string) |
| `ANDROID_KEYSTORE_PASSWORD` | Password for the upload keystore                                   | `your-secure-keystore-password`        |
| `ANDROID_KEY_PASSWORD`      | Password for the upload key (same as keystore password for PKCS12) | `your-secure-key-password`             |

### Optional

| Secret     | Description         | Default |
| ---------- | ------------------- | ------- |
| `API_PORT` | Port for API server | `3000`  |

## Setting Up Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add each secret listed above

## Generating Secure Values

### JWT Secret

```bash
openssl rand -base64 64
```

### SSH Key Pair

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy"
# Add the public key to your server's ~/.ssh/authorized_keys
# Add the private key as SSH_PRIVATE_KEY secret
```

### Android Upload Keystore

The upload keystore is used to sign production release builds for Google Play Store. Google Play App Signing manages the real app signing key -- this is only the upload key (recoverable if compromised).

#### Step 1: Generate the keystore

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore eltemplo-upload-key.keystore \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

When prompted:

- Enter a strong password (12+ chars, mixed case, numbers, symbols)
- First and last name: `El Templo`
- Organization: `El Templo`
- Country: `AR`
- Other fields: can be left blank or filled as desired

**Important:** PKCS12 format requires the same password for keystore and key. Use the same password for both prompts.

#### Step 2: Encode for GitHub Secrets

```bash
openssl base64 -A -in eltemplo-upload-key.keystore -out eltemplo-upload-key.base64.txt
```

Copy the entire contents of `eltemplo-upload-key.base64.txt` as the value for `ANDROID_KEYSTORE_BASE64`.

#### Step 3: Add secrets to GitHub

1. Go to repo **Settings** > **Secrets and variables** > **Actions**
2. Add `ANDROID_KEYSTORE_BASE64` with the base64 string from Step 2
3. Add `ANDROID_KEYSTORE_PASSWORD` with the password from Step 1
4. Add `ANDROID_KEY_PASSWORD` with the same password (PKCS12 uses one password)

#### Step 4: Backup the keystore

Store the original `eltemplo-upload-key.keystore` file securely (cloud storage, password manager, USB drive). If this file is lost and the Google Play upload key needs to be reset, you'll need to contact Google support.

#### Step 5: Clean up

Delete both `eltemplo-upload-key.keystore` and `eltemplo-upload-key.base64.txt` from your local machine after backing up and adding to GitHub Secrets.

## Environment-Specific Workflows

- **CI workflow** (`ci.yml`): Runs on all pushes and PRs - no secrets required
- **Deploy workflow** (`deploy.yml`): Runs only on master/main - requires all secrets
- **Android staging** (`build-android-staging.yml`): Manual trigger - no signing secrets required
- **Android production** (`build-android-production.yml`): Manual trigger - requires `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`

## Security Notes

1. **Never commit secrets** to the repository
2. **Rotate secrets regularly**, especially JWT_SECRET and DB_PASSWORD
3. **Use read-only database credentials** if possible for the API
4. **Limit SSH key permissions** - the deploy key should only have access to deploy paths
