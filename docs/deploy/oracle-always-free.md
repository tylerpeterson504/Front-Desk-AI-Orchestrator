# Self-hosted deployment: Oracle Cloud Always Free VM

Run the backend + dashboard on one always-on ARM VM for $0/month — no cold
starts, no Docker, no containers. This is the self-hosted alternative to the
Render blueprint in [DEPLOYMENT_NO_DOCKER.md](../DEPLOYMENT_NO_DOCKER.md);
the database stays on Neon and the MCP gateway stays on Cloudflare Workers.

**What runs where**

| Piece | Where | Cost |
| ----- | ----- | ---- |
| Backend + dashboard | Oracle Always Free VM (ARM) | $0 |
| Postgres | Neon (pooled connection string) | $0 (free plan) |
| MCP gateway | Cloudflare Workers (`mcp-worker/`) | $0 (free tier) |
| Chrome extension | Chrome Web Store (dev/unlisted while testing) | $0 / $5 to publish |
| HTTPS hostname | DuckDNS subdomain | $0 (a real domain is ~$10/yr if preferred) |

---

## 1. Oracle Cloud account and VM

1. Sign up at <https://www.oracle.com/cloud/free/> (credit card is
   verification only; Always Free resources are never charged). **Choose the
   home region carefully — it is permanent and cannot be changed later.**
2. Create a compute instance:
   - Image: **Ubuntu 24.04** (Canonical)
   - Shape: **VM.Standard.A1.Flex**, 2 OCPUs / 12 GB (the 2026 Always Free
     cap — it was halved from 4/24 in June 2026). Anything ≤ 2 OCPU / 12 GB
     stays free; the backend needs far less, 1 OCPU / 4 GB is fine.
   - Paste your SSH **public** key (ed25519 works as-is).
   - VCN: create a new VCN with public IP.
3. **"Out of host capacity" errors are common** for A1 shapes. Workarounds,
   in order: retry over a few hours; create a small A2.Flex instance first
   and resize it to A1 via the OCI CLI
   (`oci compute instance update --instance-id <ocid> --shape VM.Standard.A1.Flex --shape-config '{"ocpus":2,"memory-in-gbs":12}'`);
   or run the community retry script
   ([hitrov/oci-arm-host-capacity](https://github.com/hitrov/oci-arm-host-capacity)).
4. **Reserve a static public IP** for the instance (Instance → Edit → Public
   IP → Reserved). Free of charge. An ephemeral IP changes on stop/start,
   which would silently break DNS.

## 2. Open ports 80 and 443

Two layers must allow traffic — Oracle blocks ports by default in both:

- **VCN Security List**: VCN → Security Lists → Add Ingress Rules for TCP
  22, 80, and 443 from `0.0.0.0/0`.
- **OS firewall**: Oracle's Ubuntu images ship iptables rules that reject
  everything except 22:

  ```bash
  sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  ```

## 3. Free HTTPS hostname (DuckDNS)

1. Sign up at <https://www.duckdns.org> and register a subdomain, e.g.
   `fdao-demo.duckdns.org`.
2. Point it at the VM's reserved public IP (the DuckDNS dashboard has a
   field for this — subdomains never expire).
3. Caddy uses this hostname for automatic Let's Encrypt TLS. No DNS plugin
   is needed with a static IP. (If you later buy a real domain, only the
   hostname in the Caddyfile changes.)

## 4. Install runtime (Node 24 + Caddy)

The backend requires **Node ≥ 24** (`engines` in `backend/package.json`).

```bash
sudo apt update && sudo apt -y install git curl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt -y install nodejs
# Caddy (official repo)
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
sudo npm install -g npm@latest
```

## 5. Application setup

```bash
sudo useradd -m -s /bin/bash fdao
sudo mkdir -p /opt/fdao && sudo chown fdao:fdao /opt/fdao
sudo -u fdao git clone https://github.com/tylerpeterson504/Front-Desk-AI-Orchestrator.git /opt/fdao/app
cd /opt/fdao/app
```

**Backend** (`/opt/fdao/app/backend/.env` — never commit this file):

```ini
DATABASE_URL=postgresql://...-pooler....neon.tech/neondb?sslmode=require
JWT_SECRET=<32+ random chars>
MISTRAL_API_KEY=<key>
CORS_ORIGIN=https://fdao-demo.duckdns.org
REGISTRATION_MODE=invite
# Optional
MISTRAL_MODEL=<model id, default applies if unset>
WIFI_ENCRYPTION_KEY=<32+ chars, required if storing property Wi-Fi passwords>
```

`CORS_ORIGIN` **must** be set in production or the backend refuses to boot.
Add the extension origin (`chrome-extension://<extension-id>`) to the
comma-separated list once the extension is published.

Build and migrate:

```bash
cd /opt/fdao/app/backend
npm install --legacy-peer-deps --no-audit --no-fund
npm run build            # tsc -> dist/
npm run migrate          # dist/db/migrate.js against DATABASE_URL
```

Create the first admin after registration:

```bash
npm run set-role         # follow the prompt
```

**Dashboard** — the backend serves the built SPA itself from
`dashboard/build`, so no separate static host is needed. Vite's default
output is `dist/`, so override the output directory:

```bash
cd /opt/fdao/app/dashboard
npm install --legacy-peer-deps --no-audit --no-fund
VITE_API_URL=https://fdao-demo.duckdns.org npm run build -- --outDir build
```

Because the dashboard is served from the same origin as the API, there are
no cross-origin cookie concerns and `CORS_ORIGIN` needs only the site
origin itself.

## 6. systemd service

Copy `fdao-backend.service` from this directory:

```bash
sudo cp /opt/fdao/app/docs/deploy/fdao-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fdao-backend
```

Logs: `journalctl -u fdao-backend -f`. The unit restarts the backend on
crash and starts it on boot.

## 7. Caddy reverse proxy

Replace `/etc/caddy/Caddyfile` with the version in this directory (edit the
hostname), then:

```bash
sudo systemctl reload caddy
```

Caddy obtains and renews the Let's Encrypt certificate automatically. Verify
end to end:

```bash
curl https://fdao-demo.duckdns.org/health
```

## 8. MCP worker and extension

- **MCP worker**: deploy from `mcp-worker/` with
  `BACKEND_URL=https://fdao-demo.duckdns.org`
  (`npm install && npx wrangler login && npx wrangler deploy`).
- **Chrome extension**: set its API base URL to
  `https://fdao-demo.duckdns.org` and add the extension origin to
  `CORS_ORIGIN` (see step 5), then restart the backend.

## 9. Hardening and maintenance

- `sudo apt -y install unattended-upgrades && sudo dpkg-reconfigure unattended-upgrades`
- Keep Node current: NodeSource updates arrive via `apt upgrade`.
- **Rotate credentials before real properties go live** — anything that
  ever touched git history (see the CHANGELOG note on PR #313) must be
  rotated in its provider: Mistral, Neon, `JWT_SECRET`,
  `WIFI_ENCRYPTION_KEY`.

### Updating a deployment

```bash
cd /opt/fdao/app && sudo -u fdao git pull
cd backend && npm install --legacy-peer-deps && npm run build && npm run migrate
cd ../dashboard && VITE_API_URL=https://fdao-demo.duckdns.org npm run build -- --outDir build
sudo systemctl restart fdao-backend
```

Migrations run before the restart; `systemctl restart` is the only
downtime (seconds).
