# AgentGuard — Self-Hosting Guide (VPS & Docker Compose)

This guide walks operators through deploying a clean, production-ready, self-hosted instance of **AgentGuard** on an Ubuntu/Debian VPS using Docker Compose.

---

## 1. Prerequisites

### Recommended VPS Specifications
- **Operating System:** Ubuntu 22.04 LTS / 24.04 LTS or Debian 12
- **CPU:** 2 vCPU
- **Memory (RAM):** 2 GB minimum (4 GB recommended for concurrent AI risk evaluations)
- **Disk Space:** 20 GB SSD
- **Network:** Static public IPv4, open inbound ports `80` (HTTP) and `443` (HTTPS). Internal ports `3000` (Dashboard), `3001` (Gateway), and `54329` (Postgres) should remain firewalled or bound to localhost behind a reverse proxy.

### Install Docker & Docker Compose
On your VPS, install Docker and the Docker Compose plugin:

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install prerequisites
sudo apt install -y ca-certificates curl gnupg lsb-release git

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker engine and compose
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

---

## 2. Clone Repository & Configure Environment

Clone the repository to your deployment directory (e.g. `/opt/agentguard`):

```bash
sudo git clone https://github.com/altafpasha/agentguard.git /opt/agentguard
cd /opt/agentguard
```

### Create Your Production `.env`
Copy the example environment configuration:

```bash
cp .env.example .env
```

Edit `.env` using your preferred editor (`nano .env` or `vim .env`):

```bash
nano .env
```

### Critical Environment Settings
| Variable | Description | Production Recommendation |
| :--- | :--- | :--- |
| `POSTGRES_PASSWORD` | PostgreSQL superuser password | Generate a strong random password (e.g. `openssl rand -hex 24`) |
| `DATABASE_URL` | PostgreSQL connection string | Match `POSTGRES_PASSWORD` and DB name |
| `SEED_DEMO_DATA` | Sample mock event & user generator | Keep `false` for clean production deployment |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox Client ID | From [PayPal Developer Dashboard](https://developer.paypal.com) |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox Secret | Keep secret; stored only on server |
| `PAYPAL_ALLOW_LIVE_EXECUTION` | Execute sandbox orders | `false` (evaluation mode) or `true` (live sandbox) |
| `OPENROUTER_API_KEY` | OpenRouter semantic scanner key | Optional semantic scanner; leave placeholder if unused |

> [!IMPORTANT]
> A fresh self-hosted installation starts with **zero precreated users**, **zero fake metrics**, and **zero mock events**. You will create the initial Owner account in Step 4.

---

## 3. Deploy Containers with Docker Compose

Start the services in detached mode:

```bash
docker compose up -d --build
```

### Check Container Status
Verify that all 3 services (`agentguard-postgres`, `agentguard-gateway`, and `agentguard-dashboard`) are running and healthy:

```bash
docker compose ps
```

Expected output:
```
NAME                   IMAGE                  COMMAND                  SERVICE      CREATED         STATUS                   PORTS
agentguard-dashboard   agentguard-dashboard   "docker-entrypoint.s…"   dashboard    1 minute ago    Up 1 minute (healthy)    0.0.0.0:3000->3000/tcp
agentguard-gateway     agentguard-agentguard  "docker-entrypoint.s…"   agentguard   1 minute ago    Up 1 minute (healthy)    0.0.0.0:3001->3001/tcp
agentguard-postgres    postgres:16-alpine     "docker-entrypoint.s…"   postgres     1 minute ago    Up 1 minute (healthy)    127.0.0.1:54329->5432/tcp
```

### View Live Logs
```bash
docker compose logs -f
```

---

## 4. Initial Setup Flow (First-Run Owner Creation)

1. Open your browser and navigate to:
   ```
   http://<YOUR_VPS_IP>:3000/setup
   ```
   *(Or `https://agentguard.yourdomain.com/setup` if your reverse proxy is already configured)*

2. Complete the initial setup form:
   - **Full Name:** Operator / Security Lead Name
   - **Username:** Owner login handle (alphanumeric)
   - **Email:** Primary administrator email address
   - **Password:** Minimum 8 characters

3. Click **Initialize Security Installation**.
   - The server transactionally registers the Owner account with cryptographic salt & password hash.
   - The setup route is **permanently locked**. Any subsequent requests to `/setup` or `/api/v1/auth/setup-owner` are rejected with `403 Forbidden` (`SETUP_ALREADY_COMPLETED`).
   - You are automatically authenticated and redirected to your clean dashboard overview.

---

## 5. Reverse Proxy & SSL/TLS Guidance

To serve AgentGuard securely over HTTPS, place a reverse proxy in front of the Docker containers.

### Option A: Caddy (Recommended — Automatic HTTPS)
Caddy automatically obtains and renews Let's Encrypt certificates with zero configuration.

1. Install Caddy:
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install caddy
   ```

2. Configure `/etc/caddy/Caddyfile`:
   ```caddy
   agentguard.yourdomain.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

3. Reload Caddy:
   ```bash
   sudo systemctl reload caddy
   ```

---

### Option B: Nginx + Certbot

1. Install Nginx and Certbot:
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. Create `/etc/nginx/sites-available/agentguard`:
   ```nginx
   server {
       server_name agentguard.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. Enable the site and obtain SSL certificate:
   ```bash
   sudo ln -s /etc/nginx/sites-available/agentguard /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d agentguard.yourdomain.com
   ```

---

## 6. User Management, RBAC & Authentication Settings

AgentGuard enforces strict, centralized server-side Role-Based Access Control (RBAC):

| Role | Hierarchy Level | Capabilities & Access Boundary |
| :--- | :--- | :--- |
| **Owner** | Root Authority | Full unconstrained control. Manages system settings, user invitations, role assignments, database migrations, deterministic financial policies, and emergency recovery. Cannot be deleted or demoted if they are the last active owner. |
| **Admin** | Administrator | Full administrative capabilities. Can invite users (`EDITOR`, `VIEWER`, or `ADMIN`), modify security settings, change operator roles, reset user passwords, revoke sessions, and update deterministic payment policies. |
| **Editor** | Operational Operator | Access to permitted operational features: can review, approve, and reject Tier-3 HITL pending approvals in the human queue, run Attack Lab scenario simulations, and test gateway probes. Cannot modify policies, manage users, or change authentication settings. |
| **Viewer** | Read-Only Inspector | Read-only access to monitoring telemetry, overview metrics, immutable audit logs, transaction history, and system health status. Write endpoints (`/approve`, `/reject`, `/update`) strictly return `403 Forbidden`. |

### Settings → Authentication & Access Control
Administrators can configure self-hosted registration and onboarding behavior under **Settings → Authentication & Access**:

1. **Allow Public Sign-Up:** Toggle whether public registration is open or disabled. Fresh installations default to `false` for maximum operational security.
2. **Default New-User Role:** When public sign-up is permitted, defines the baseline role automatically assigned (`VIEWER` or `EDITOR`). Administrative roles cannot be granted by default.
3. **Invite-Only Registration:** Enforces that only operators possessing a single-use cryptographically signed invitation token can activate an account.
4. **Require Email Verification:** Requires token validation over SMTP before active sessions can be initialized.

### Single-Use Cryptographic Invitations
1. An **Admin** or **Owner** navigates to `/users` and clicks **Invite New Operator**.
2. Select the target role (`EDITOR`, `VIEWER`, or `ADMIN`) and submit the operator's email.
3. The gateway creates a single-use cryptographic invitation token, stores only its SHA-256 hash in the database, and provides a one-time activation link (`https://agentguard.yourdomain.com/accept-invite?token=...`).
4. Invitations expire automatically after 72 hours, cannot be reused, and can be revoked on-demand from the Invitations Management tab.

---

## 7. Emergency Owner Recovery CLI

If all active Owner passwords are lost, VPS operators with shell access can create or promote an Owner account directly via the server command line:

```bash
# Execute owner creation inside the running gateway container
docker compose exec agentguard npx tsx scripts/create-owner.ts <username> <email> <password> "<Full Name>"
```

Example:
```bash
docker compose exec agentguard npx tsx scripts/create-owner.ts sysadmin sysadmin@company.com "SuperStrongPassword123!" "System Administrator"
```

The script:
- Safely hashes the password using SHA-256 + cryptographic salt.
- Creates or promotes the user to role `OWNER`.
- Marks the account status as `ACTIVE`.
- Outputs confirmation without logging sensitive secrets.

---

## 8. Database Backup & Restore

All relational data (users, policies, approval records, audit events) is stored in the Docker volume `postgres_data`.

### Automated / Manual Backup
To create a timestamped SQL dump:

```bash
# Create backups directory
mkdir -p /opt/agentguard/backups

# Export database
docker compose exec -T postgres pg_dump -U postgres agentguard_dev > /opt/agentguard/backups/agentguard_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Database Restore
To restore from an existing backup:

```bash
# Drop existing connections and restore
docker compose exec -T postgres psql -U postgres -d agentguard_dev < /opt/agentguard/backups/agentguard_backup_20261027_010000.sql
```

---

## 9. Updating AgentGuard

To update to the latest release while preserving all database records:

```bash
cd /opt/agentguard

# Fetch latest changes
git pull origin main

# Rebuild and restart containers
docker compose up -d --build

# Run database migrations
docker compose exec agentguard npx tsx src/db/migrate.ts
```

---

## 10. Security Checklist for Production

- [ ] **Firewall Ports:** Only ports `80` and `443` should be accessible externally. `54329` (Postgres) and `3001` (Gateway) are bound to localhost (`127.0.0.1`).
- [ ] **Strong Passwords:** Ensure `POSTGRES_PASSWORD` and Owner passwords are at least 16 characters.
- [ ] **HTTPS Enforced:** SSL/TLS enabled via Caddy or Nginx with HTTP-to-HTTPS redirect.
- [ ] **Initial Setup Completed:** Visited `/setup` and verified that the initial owner was registered and the route is permanently closed.
- [ ] **Audit Logs Preserved:** Verify `postgres_data` volume is backed up periodically using cron.
