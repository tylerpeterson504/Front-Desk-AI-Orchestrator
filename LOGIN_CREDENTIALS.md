# 🔐 Front Desk AI Orchestrator - Login Credentials

**Last Updated:** September 14, 2026  
**Status:** ✅ All Credentials Verified  
**Authorized By:** Tyler Peterson

---

## 📋 TABLE OF CONTENTS

1. [Application User Logins](#-application-user-logins)
2. [Database Credentials](#-database-credentials)
3. [API Keys & Service Tokens](#-api-keys--service-tokens)
4. [Cloud Storage Credentials](#-cloud-storage-credentials)
5. [AI Service Credentials](#-ai-service-credentials)
6. [Security Notes](#-security-notes)

---

## 👤 APPLICATION USER LOGINS

### Default Users (Created by Database Seeding)

The system automatically creates the following users when `RUN_SEEDS=true` in `.env` and the database is empty.

| # | Email | Password | Role | Property ID | Purpose |
|---|-------|----------|------|-------------|---------|
| 1 | `admin@hotel.com` | `admin123` | `admin` | - | Full administrative access |
| 2 | `agent@hotel.com` | `agent123` | `agent` | 1 | Standard agent user |
| 3 | `demo@example.com` | `password123` | `agent` | - | Demo/test user |

### User Roles & Permissions

| Role | Permissions |
|------|-------------|
| `admin` | Full access - All CRUD operations, user management, property management |
| `agent` | Standard access - View and manage properties, templates, shift notes, use copilot |

### How to Create Additional Users

1. **Via API:** POST to `/api/auth/register`
   ```json
   {
     "email": "newuser@hotel.com",
     "password": "yourpassword",
     "name": "New User",
     "role": "agent"
   }
   ```

2. **Via Database:** Insert directly into `users` table
   - Password must be bcrypt hashed (use `bcrypt.hash(password, 12)`)

---

## 🗄️ DATABASE CREDENTIALS

### Neon PostgreSQL Database

**Connection String:**
```
postgresql://neondb_owner:npg_3GnjVL2kyQbd@ep-sweet-rice-axacicig-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

**Individual Settings:**
- **Host:** `ep-sweet-rice-axacicig-pooler.c-4.us-east-2.aws.neon.tech`
- **Port:** `5432`
- **Database Name:** `neondb`
- **Username:** `neondb_owner`
- **Password:** `npg_3GnjVL2kyQbd`
- **SSL Mode:** `require`
- **Channel Binding:** `require`

**Neon Project ID:** (Not currently set in .env - optional)

**AI Gateway Token:** `nt_live_43fa44115995_dlNzcrQ2FjvuBPNXPo9I6W9SUk3H0yMr`

---

## 🔑 API KEYS & SERVICE TOKENS

### JWT Configuration
- **JWT Secret:** `dev_jwt_secret_change_for_production_12345`
- **JWT TTL:** `15m` (15 minutes)
- **Refresh Token TTL:** `30` days
- **BCRYPT Rounds:** `12`

### Registration Configuration
- **Mode:** `open` (anyone can register)
- **Invite Token:** Not set (empty - registration is open)

### Encryption Keys
- **WiFi Password Encryption Key:** `dev_wifi_encryption_key_change_for_production`
  - Used for AES-256-GCM encryption of WiFi passwords

---

## ☁️ CLOUD STORAGE CREDENTIALS

### Neon S3 Storage

**Endpoint:** `https://br-delicate-bonus-axx6mn1q.storage.c-4.us-east-2.aws.neon.tech`

**Credentials:**
- **Access Key ID:** `nak_live_43fa4411599548e7b6e08e5532c7c686`
- **Secret Access Key:** `nsk_live_6c826c3c91ea9795e1daa9b9bd789d91d6cb7888d43fab38a61810218aa3c6b7`
- **Region:** `us-east-2`

---

## 🤖 AI SERVICE CREDENTIALS

### Mistral AI
- **API Key:** `dviCU04SySwoIoi4mLMxakglNMkddvuQ`
- **Model:** Not explicitly set (defaults to latest)

### Google (Gemini)
- **Model:** `gemini-1.5-flash` (default in config)
- **API Key:** Not set in .env (optional - configured in copilotService)

### Perplexity
- **API Key:** Not set in .env (optional)
- **Model:** `sonar` (default in config)

### Hugging Face
- **Token:** Not set in .env (optional - referenced in copilotService)

### Databricks
- **Host:** Not set (optional)
- **Token:** Not set (optional)
- **Warehouse ID:** Not set (optional)

### GitHub
- **Token:** Not set (optional - for GitHub API access)

---

## 🛡️ SECURITY NOTES

### ⚠️ IMPORTANT - FOR PRODUCTION

**All development credentials are exposed in this file for convenience.**

For production deployment, you MUST:

1. **Regenerate ALL secrets:**
   - JWT_SECRET: Generate a new 32+ character random string
   - WIFI_ENCRYPTION_KEY: Generate a new 32-byte base64 string
   - Database Password: Create a new database user with strong password
   - API Keys: Use production keys, not development ones

2. **Use environment variables securely:**
   - Use `.env.production` for production
   - Never commit `.env` files to version control
   - Use a secrets manager (AWS Secrets Manager, Vault, etc.)

3. **Rotate exposed credentials:**
   - The database password in `.env` is exposed in Git history
   - The Mistral API key is exposed in Git history
   - The Neon AI Gateway token is exposed in Git history
   - The AWS S3 keys are exposed in Git history

4. **Enable HTTPS:**
   - Always use HTTPS in production
   - Set `NODE_ENV=production`

### 🔐 Password Hashing

All user passwords are stored as bcrypt hashes with 12 rounds.
The seed-runner.ts creates users with pre-hashed passwords.

### 📝 Configuration File Location

All credentials are loaded from:
- `backend/.env` (development)
- `backend/.env.local` (local overrides)
- `backend/.env.production` (production - recommended)

---

## 🚀 QUICK START

### 1. Start the Backend
```bash
cd backend
npm install
npm run dev
```

### 2. Access the Application
- Backend runs on: `http://localhost:3001`
- API Documentation: `/api`

### 3. Login with Default Users

**Admin Access:**
```
Email: admin@hotel.com
Password: admin123
```

**Agent Access:**
```
Email: agent@hotel.com
Password: agent123
```

**Demo Access:**
```
Email: demo@example.com
Password: password123
```

### 4. API Authentication

Include JWT token in Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

Get token by logging in:
```
POST /api/auth/login
{
  "email": "admin@hotel.com",
  "password": "admin123"
}
```

---

## 📞 SUPPORT

For issues with credentials or authentication:
1. Check `.env` file for missing configuration
2. Verify database connection with `DATABASE_URL`
3. Ensure `RUN_SEEDS=true` to create default users
4. Check logs for authentication errors

---

**✅ All credentials documented and verified.**
**⚠️ Remember to regenerate secrets for production use.**
