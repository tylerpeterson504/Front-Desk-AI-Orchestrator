# 🔐 JWT Token Guide - Front Desk AI Orchestrator

**Last Updated:** September 14, 2026  
**Status:** ✅ Complete  
**Authorized By:** Tyler Peterson

---

## 📋 TABLE OF CONTENTS

1. [How JWT Authentication Works](#-how-jwt-authentication-works)
2. [Getting a JWT Token](#-getting-a-jwt-token)
3. [Using the JWT Token](#-using-the-jwt-token)
4. [Token Structure](#-token-structure)
5. [Refresh Tokens](#-refresh-tokens)
6. [Security Best Practices](#-security-best-practices)
7. [Troubleshooting](#-troubleshooting)

---

## 🎯 HOW JWT AUTHENTICATION WORKS

The Front Desk AI Orchestrator uses **JSON Web Tokens (JWT)** for authentication:

```
User Login → Server Validates Credentials → Server Generates JWT → Client Stores JWT → 
Client Sends JWT with Each Request → Server Validates JWT → Access Granted
```

### Key Components:
- **Access Token**: Short-lived (15 minutes) - used for API requests
- **Refresh Token**: Long-lived (30 days) - used to get new access tokens
- **JWT Secret**: `dev_jwt_secret_change_for_production_12345` (in .env)

---

## 🔑 GETTING A JWT TOKEN

### Method 1: Using cURL (Command Line)

```bash
# Login with admin credentials
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hotel.com","password":"admin123"}'

# Login with agent credentials
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@hotel.com","password":"agent123"}'

# Login with demo credentials
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password123"}'
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@hotel.com",
    "name": "Admin User",
    "role": "admin"
  }
}
```

### Method 2: Using Postman

1. Create a new POST request to: `http://localhost:3001/api/auth/login`
2. Set Headers:
   - `Content-Type: application/json`
3. Set Body (raw JSON):
   ```json
   {
     "email": "admin@hotel.com",
     "password": "admin123"
   }
   ```
4. Send the request
5. Copy the `access_token` from the response

### Method 3: Using Dashboard

1. Open http://localhost:3000 in your browser
2. Click "Login" button
3. Enter your credentials:
   - Email: `admin@hotel.com`
   - Password: `admin123`
4. After successful login, the JWT token is automatically stored in the browser's localStorage
5. To view it:
   - Open Developer Tools (F12)
   - Go to Application → Local Storage
   - Look for the `access_token` key

### Method 4: Using JavaScript (Browser Console)

```javascript
// Login and get token
fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@hotel.com', password: 'admin123' })
})
.then(r => r.json())
.then(data => {
  console.log('Access Token:', data.access_token);
  console.log('Refresh Token:', data.refresh_token);
  console.log('User:', data.user);
});
```

---

## 💼 USING THE JWT TOKEN

### With cURL

```bash
# Basic authenticated request
curl http://localhost:3001/api/properties \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# POST request with token
curl -X POST http://localhost:3001/api/properties \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Property"}'
```

### With Postman

1. Add a new header to your request:
   - **Key:** `Authorization`
   - **Value:** `Bearer YOUR_ACCESS_TOKEN`

### With JavaScript (Fetch API)

```javascript
const token = localStorage.getItem('access_token'); // or your token string

fetch('http://localhost:3001/api/properties', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(r => r.json())
.then(data => console.log(data));
```

### With Axios

```javascript
const token = localStorage.getItem('access_token');

axios.get('http://localhost:3001/api/properties', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(response => console.log(response.data));
```

### With Node.js

```javascript
const axios = require('axios');

const token = 'YOUR_ACCESS_TOKEN';

axios.get('http://localhost:3001/api/properties', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(response => console.log(response.data));
```

---

## 🔍 TOKEN STRUCTURE

JWT tokens consist of three parts separated by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBob3RlbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MTg2NjQwMDB9.SIGNATURE
          ↑ Header                           ↑ Payload                          ↑ Signature
```

### Decoding a JWT Token

You can decode (but not verify) a JWT token using:
- [jwt.io](https://jwt.io/) - Online decoder
- Command line:
  ```bash
  # Using Node.js
  node -e "console.log(JSON.stringify(require('jsonwebtoken').decode('YOUR_TOKEN'), null, 2))"
  
  # Or using a simple script
  echo "YOUR_TOKEN" | base64 -d | jq
  ```

### Token Payload Example

```json
{
  "id": 1,
  "email": "admin@hotel.com",
  "role": "admin",
  "iat": 1718664000,
  "exp": 1718665500
}
```

**Payload Fields:**
- `id`: User ID
- `email`: User email
- `role`: User role (admin/agent)
- `iat`: Issued at timestamp (Unix epoch)
- `exp`: Expiration timestamp (Unix epoch) - 15 minutes from `iat`

---

## 🔄 REFRESH TOKENS

### When Access Token Expires

After 15 minutes, your access token will expire. Use the refresh token to get a new one:

```bash
# Use refresh token to get new access token
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"YOUR_REFRESH_TOKEN"}'
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

### Automatic Token Refresh (JavaScript)

```javascript
let accessToken = localStorage.getItem('access_token');
let refreshToken = localStorage.getItem('refresh_token');

async function getAccessToken() {
  // Try to use existing token
  if (accessToken) {
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      if (payload.exp * 1000 > Date.now()) {
        return accessToken;
      }
    } catch (e) {
      // Token is invalid
    }
  }

  // Token expired or invalid - refresh it
  const response = await fetch('http://localhost:3001/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  const data = await response.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  localStorage.setItem('access_token', accessToken);
  localStorage.setItem('refresh_token', refreshToken);
  
  return accessToken;
}

// Usage
const token = await getAccessToken();
```

---

## 🔒 SECURITY BEST PRACTICES

### ⚠️ IMPORTANT SECURITY NOTES

1. **Never expose your JWT token in:**
   - Client-side code (except in localStorage/sessionStorage)
   - URLs (query parameters)
   - Logs
   - Version control (Git)
   - Public repositories

2. **Token Expiration:**
   - Access tokens expire after 15 minutes (configurable via `JWT_TTL`)
   - Refresh tokens expire after 30 days (configurable via `REFRESH_TOKEN_TTL_DAYS`)

3. **Storage:**
   - ✅ **Recommended:** HTTP-only cookies (most secure)
   - ✅ **Acceptable:** localStorage/sessionStorage (with CSRF protection)
   - ❌ **Never:** In plain JavaScript variables, URL parameters

4. **Production Configuration:**
   ```bash
   # Regenerate these for production:
   JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
   JWT_TTL=15m
   REFRESH_TOKEN_TTL_DAYS=30
   ```

### HTTPS Requirement

**Always use HTTPS in production!** JWT tokens are signed but not encrypted. 
Without HTTPS, tokens can be intercepted in transit.

```
# In .env.production
NODE_ENV=production
# Ensure your server uses HTTPS
```

---

## 🚨 TROUBLESHOOTING

### Problem: Login returns 401 Unauthorized

**Solution:**
1. Verify your credentials are correct
2. Check that the user exists in the database
3. Ensure `RUN_SEEDS=true` if using default users
4. Verify database connection in `.env`

### Problem: Login returns 400 Bad Request

**Solution:**
1. Check that you're sending both `email` and `password`
2. Verify the request body is valid JSON
3. Ensure Content-Type header is `application/json`

### Problem: Token returns 401 when used

**Solution:**
1. Check that token hasn't expired (15 minutes)
2. Verify token is being sent in `Authorization: Bearer <token>` header
3. Ensure token is correctly stored (no typos)
4. Try refreshing the token

### Problem: Invalid token signature

**Solution:**
1. Verify `JWT_SECRET` in `.env` matches what was used to sign the token
2. Restart the backend server after changing `JWT_SECRET`
3. Login again to get a new token

### Problem: Token not being accepted

**Solution:**
1. Verify the token format: `eyJ...`
2. Check token expiration: Decode the token and verify `exp` field
3. Ensure you're using the access token, not the refresh token
4. Check server logs for authentication errors

### Debugging Tips

```bash
# Check if backend is running
curl http://localhost:3001/health

# Check login endpoint
curl -v -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hotel.com","password":"admin123"}'

# Check protected endpoint with token
curl -v http://localhost:3001/api/properties \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check server logs
cd backend && npm run dev
# Or with PM2
pm2 logs frontdesk-backend
```

---

## 📊 TOKEN INFORMATION SUMMARY

| Field | Value | Notes |
|-------|-------|-------|
| **JWT Secret** | `dev_jwt_secret_change_for_production_12345` | **CHANGE FOR PRODUCTION** |
| **Access Token TTL** | 15 minutes | Configurable via `JWT_TTL` |
| **Refresh Token TTL** | 30 days | Configurable via `REFRESH_TOKEN_TTL_DAYS` |
| **Algorithm** | HS256 | HMAC-SHA256 |
| **BCRYPT Rounds** | 12 | For password hashing |

---

## 🎓 EXAMPLE: COMPLETE AUTHENTICATION FLOW

```javascript
// Step 1: Login
const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@hotel.com',
    password: 'admin123'
  })
});
const { access_token, refresh_token, user } = await loginResponse.json();

// Step 2: Use token for API calls
const propertiesResponse = await fetch('http://localhost:3001/api/properties', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
const properties = await propertiesResponse.json();

// Step 3: Handle token expiration
async function makeAuthenticatedRequest(url, options = {}) {
  let token = localStorage.getItem('access_token');
  
  // Check if token is expired or about to expire
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresIn = (payload.exp * 1000) - Date.now();
    
    // Refresh if token expires within next 30 seconds
    if (expiresIn < 30000) {
      const refreshResponse = await fetch('http://localhost:3001/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') })
      });
      const refreshData = await refreshResponse.json();
      token = refreshData.access_token;
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', refreshData.refresh_token);
    }
  } catch (e) {
    // Token is invalid, try to refresh
    try {
      const refreshResponse = await fetch('http://localhost:3001/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') })
      });
      const refreshData = await refreshResponse.json();
      token = refreshData.access_token;
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', refreshData.refresh_token);
    } catch (refreshError) {
      // Refresh failed, redirect to login
      window.location.href = '/login';
      return;
    }
  }
  
  // Make the request with the valid token
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
}

// Usage
const response = await makeAuthenticatedRequest('/api/properties');
```

---

## 🔗 QUICK REFERENCE

### Default User Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@hotel.com` | `admin123` |
| Agent | `agent@hotel.com` | `agent123` |
| Demo | `demo@example.com` | `password123` |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login and get JWT tokens |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/register` | POST | Register new user (if open) |
| `/api/users/me` | GET | Get current user info |

### Environment Configuration

```bash
# In backend/.env
JWT_SECRET=dev_jwt_secret_change_for_production_12345
JWT_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
```

---

## ✅ SUMMARY

You now have all the information needed to:
- ✅ Get a JWT token via login
- ✅ Use the token for authenticated API requests
- ✅ Refresh tokens when they expire
- ✅ Troubleshoot common authentication issues
- ✅ Implement secure token handling in your application

**Remember:** Always regenerate `JWT_SECRET` for production use!

---

**📞 Need Help?**
- Check server logs for authentication errors
- Verify database connection
- Ensure `RUN_SEEDS=true` for default users
- Contact: Tyler Peterson
