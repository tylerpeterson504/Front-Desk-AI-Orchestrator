# Docker Development Environment Setup

This guide walks you through running the Front Desk AI Orchestrator locally using Docker.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git (to clone the repository)

## Quick Start

### Linux / macOS

```bash
chmod +x docker-up.sh docker-down.sh docker-logs.sh docker-test.sh
./docker-up.sh
```

### Windows

```cmd
docker-up.bat
```

Then open your browser to **http://localhost:3000**

**Demo credentials:** `demo@example.com` / `password123`

---

## Services

| Service   | Port | URL                    |
|-----------|------|------------------------|
| Dashboard | 3000 | http://localhost:3000  |
| Backend   | 3001 | http://localhost:3001  |
| Database  | 5432 | localhost:5432         |

---

## Step-by-Step Setup

### 1. Copy environment files

```bash
cp backend/.env.example backend/.env
cp dashboard/.env.example dashboard/.env
```

### 2. Start all services

```bash
docker-compose up -d
```

Docker will:
- Pull the PostgreSQL 12 image
- Build the backend and dashboard containers
- Run database migrations automatically
- Seed demo data (St.Pierre Hotel + Andrew Jackson Hotel)

### 3. Verify services are running

```bash
docker-compose ps
```

All three services (`db`, `backend`, `dashboard`) should show **Up**.

### 4. Check the backend health endpoint

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok"}
```

---

## Demo Data

The database is automatically seeded with:

### Properties
- **St.Pierre Hotel** – `stpierre.stayntouch.com` – WiFi: `StPierre-Guest`
- **Andrew Jackson Hotel** – `andrewjackson.stayntouch.com` – WiFi: `AndrewJackson-Guest`

### Demo User
- Email: `demo@example.com`
- Password: `password123`
- Role: `agent`

---

## Running Tests

```bash
# Linux/macOS
./docker-test.sh

# Windows
docker-test.bat

# Or directly
docker-compose exec backend npm test
```

---

## Viewing Logs

```bash
# All services
./docker-logs.sh

# Specific service
./docker-logs.sh backend
./docker-logs.sh dashboard
./docker-logs.sh db
```

---

## Stopping Services

```bash
# Linux/macOS
./docker-down.sh

# Windows
docker-down.bat

# Stop and remove volumes (full reset)
docker-compose down -v
```

---

## Database Access

Connect directly to the database:

```bash
docker-compose exec db psql -U frontdesk_user -d frontdesk_ai
```

Useful queries:

```sql
-- List users
SELECT id, email, name, role FROM users;

-- List properties
SELECT id, name, url_pattern FROM properties;

-- List templates
SELECT id, name, category FROM templates;
```

---

## Troubleshooting

### Services won't start
```bash
docker-compose logs backend
docker-compose logs db
```

### Database connection errors
Make sure the `db` service is healthy before the backend starts:
```bash
docker-compose ps
```

### Port already in use
Change the host port in `docker-compose.yml` **and** update the dashboard `REACT_APP_API_URL` to match:
```yaml
# backend service
ports:
  - "3002:3001"  # change 3002 to any free port

# dashboard service
environment:
  - REACT_APP_API_URL=http://localhost:3002
```

### Full reset
```bash
docker-compose down -v
docker-compose up -d
```

---

## Chrome Extension

To load the extension in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

The extension connects to `http://localhost:3001` by default.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable       | Default                              | Description              |
|----------------|--------------------------------------|--------------------------|
| `PORT`         | `3001`                               | Backend server port      |
| `DB_HOST`      | `localhost` (`db` in Docker)         | PostgreSQL host          |
| `DB_PORT`      | `5432`                               | PostgreSQL port          |
| `DB_NAME`      | `frontdesk_ai`                       | Database name            |
| `DB_USER`      | `frontdesk_user`                     | Database user            |
| `DB_PASSWORD`  | `frontdesk_pass`                     | Database password        |
| `JWT_SECRET`   | `dev_secret_change_in_production`    | JWT signing secret       |
| `BCRYPT_ROUNDS`| `10`                                 | Password hashing rounds  |
| `RUN_SEEDS`    | `true`                               | Auto-seed on startup     |

### Dashboard (`dashboard/.env`)

| Variable           | Default                  | Description         |
|--------------------|--------------------------|---------------------|
| `REACT_APP_API_URL`| `http://localhost:3001`  | Backend API URL     |
| `PORT`             | `3000`                   | Dashboard port      |
