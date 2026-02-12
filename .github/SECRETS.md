# GitHub Secrets Configuration

This document lists all the GitHub secrets required for the CI/CD workflows.

## Required Secrets

### Server Access
| Secret | Description | Example |
|--------|-------------|---------|
| `SSH_PRIVATE_KEY` | Private SSH key for server access | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_USER` | SSH username for deployment | `ubuntu` |
| `SERVER_HOST` | Server IP or hostname | `54.21.0.171` |

### Deployment Paths
| Secret | Description | Example |
|--------|-------------|---------|
| `API_DEPLOY_PATH` | Path on server for API files | `/var/www/el-templo-api` |
| `APP_DEPLOY_PATH` | Path on server for member app files | `/var/www/member-app` |
| `ADMIN_DEPLOY_PATH` | Path on server for admin app files | `/var/www/admin-app` |

### Database Configuration
| Secret | Description | Example |
|--------|-------------|---------|
| `DB_HOST` | MySQL host | `localhost` or RDS endpoint |
| `DB_PORT` | MySQL port (optional, default: 3306) | `3306` |
| `DB_USER` | MySQL username | `eltemplo_user` |
| `DB_PASSWORD` | MySQL password | `secure-password-here` |
| `DB_NAME` | MySQL database name | `eltemplo` |

### Authentication
| Secret | Description | Example |
|--------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT signing (generate with `openssl rand -base64 64`) | `long-random-string` |
| `JWT_EXPIRES_IN` | Token expiration (optional, default: 7d) | `7d` |

### Application URLs
| Secret | Description | Example |
|--------|-------------|---------|
| `VITE_API_URL` | Full API URL for frontend builds | `https://api.eltemplo.org/api` |
| `FRONTEND_URL` | Member app URL for CORS | `https://app.eltemplo.org` |
| `ADMIN_URL` | Admin app URL for CORS | `https://admin.eltemplo.org` |

### Optional
| Secret | Description | Default |
|--------|-------------|---------|
| `API_PORT` | Port for API server | `3000` |

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

## Environment-Specific Workflows

- **CI workflow** (`ci.yml`): Runs on all pushes and PRs - no secrets required
- **Deploy workflow** (`deploy.yml`): Runs only on master/main - requires all secrets

## Security Notes

1. **Never commit secrets** to the repository
2. **Rotate secrets regularly**, especially JWT_SECRET and DB_PASSWORD
3. **Use read-only database credentials** if possible for the API
4. **Limit SSH key permissions** - the deploy key should only have access to deploy paths
