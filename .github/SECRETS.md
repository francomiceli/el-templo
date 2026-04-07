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

### iOS Signing (App Store)

| Secret                         | Description                                                         | Example                                |
| ------------------------------ | ------------------------------------------------------------------- | -------------------------------------- |
| `IOS_BUILD_CERTIFICATE_BASE64` | Apple Distribution certificate (.p12) encoded as base64             | `MIIKfAIBAzCC...` (long base64 string) |
| `IOS_P12_PASSWORD`             | Password for the .p12 certificate export                            | `your-secure-p12-password`             |
| `IOS_PROVISION_PROFILE_BASE64` | App Store provisioning profile (.mobileprovision) encoded as base64 | `MIIKfAIBAzCC...` (long base64 string) |
| `APPLE_API_KEY_ID`             | App Store Connect API key ID                                        | `ABC123DEFG`                           |
| `APPLE_API_ISSUER_ID`          | App Store Connect API issuer ID                                     | `12345678-abcd-efgh-ijkl-123456789012` |
| `APPLE_API_KEY_BASE64`         | App Store Connect API private key (.p8) encoded as base64           | `LS0tLS1CRUdJ...`                      |

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

### iOS Distribution Certificate & App Store Connect API Key

The iOS signing secrets are required for building and uploading the app to TestFlight / App Store. Both staging and production workflows use the same signing identity (Apple Distribution certificate for App Store distribution).

#### Step 1: Create Apple Distribution Certificate

1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click "+" to create a new certificate
3. Select "Apple Distribution" (NOT "iOS Distribution" which is legacy)
4. Upload a Certificate Signing Request (CSR) generated from Keychain Access on a Mac, OR generate one via the Apple Developer portal
5. Download the .cer file
6. If using a Mac: Double-click to install in Keychain Access, then export as .p12 with a password
7. If no Mac available: Use the portal's built-in private key download or a third-party tool

#### Step 2: Create App Store Provisioning Profile

1. Go to https://developer.apple.com/account/resources/profiles/list
2. Click "+" to create a new profile
3. Select "App Store Connect" under Distribution
4. Select the app ID: `com.eltemplo.app`
5. Select the Distribution certificate from Step 1
6. Name it: `El Templo App Store`
7. Download the .mobileprovision file

#### Step 3: Create App Store Connect API Key

1. Go to https://appstoreconnect.apple.com/access/integrations/api
2. Click "+" to generate a new API key
3. Name: `GitHub Actions Deploy`
4. Role: `App Manager` (minimum needed for TestFlight upload)
5. Download the .p8 file (can only be downloaded ONCE)
6. Note the Key ID and Issuer ID displayed on the page

#### Step 4: Encode for GitHub Secrets

```bash
# Certificate
base64 -i distribution_certificate.p12 | pbcopy
# Paste as IOS_BUILD_CERTIFICATE_BASE64

# Provisioning profile
base64 -i El_Templo_App_Store.mobileprovision | pbcopy
# Paste as IOS_PROVISION_PROFILE_BASE64

# API key
base64 -i AuthKey_ABC123DEFG.p8 | pbcopy
# Paste as APPLE_API_KEY_BASE64
```

On Linux (no pbcopy): `base64 -w 0 file.p12` and copy the output.

#### Step 5: Add secrets to GitHub

1. Go to repo **Settings** > **Secrets and variables** > **Actions**
2. Add all 6 secrets listed in the iOS Signing table above

#### Step 6: Backup

Store the original .p12 certificate, .mobileprovision profile, and .p8 API key securely. The certificate expires after 1 year and will need to be renewed.

## Environment-Specific Workflows

- **CI workflow** (`ci.yml`): Runs on all pushes and PRs - no secrets required
- **Deploy workflow** (`deploy.yml`): Runs only on master/main - requires all secrets
- **Android staging** (`build-android-staging.yml`): Manual trigger - no signing secrets required
- **Android production** (`build-android-production.yml`): Manual trigger - requires `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`
- **iOS staging** (`build-ios-staging.yml`): Manual trigger - requires `IOS_BUILD_CERTIFICATE_BASE64`, `IOS_P12_PASSWORD`, `IOS_PROVISION_PROFILE_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`, `APPLE_API_KEY_BASE64`
- **iOS production** (`build-ios-production.yml`): Manual trigger - requires same iOS secrets as staging (both use same signing identity for App Store distribution)

## Security Notes

1. **Never commit secrets** to the repository
2. **Rotate secrets regularly**, especially JWT_SECRET and DB_PASSWORD
3. **Use read-only database credentials** if possible for the API
4. **Limit SSH key permissions** - the deploy key should only have access to deploy paths
