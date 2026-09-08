# 🚀 Front Desk AI Orchestrator - Quick Start Guide

Welcome! Your application has been configured with **Mistral AI** for guest responses. Here's everything you need to get started quickly.

---

## 📋 Table of Contents
1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Quick Installation](#quick-installation)
4. [Configuration](#configuration)
5. [Login Information](#login-information)
6. [Testing Guest Responses](#testing-guest-responses)
7. [UI Preview](#ui-preview)
8. [Next Steps](#next-steps)

---

## ✨ Features

- **Mistral AI Only** - Clean, focused AI responses
- **Better Error Handling** - Structured error codes and messages
- **Enhanced Security** - Input sanitization, XSS protection, SQL injection prevention
- **Easy Setup** - Admin user creation, database seeding
- **Multiple Properties** - Manage different hotels/properties
- **Template Responses** - Pre-written response templates
- **Shift Notes** - Staff communication
- **Audit Logs** - Track all user actions

---

## 📦 Prerequisites

### Required:
- **Node.js** v22 or higher
- **PostgreSQL** database
- **Mistral AI API Key** (from [https://mistral.ai](https://mistral.ai))

### Optional:
- **npm** (Node Package Manager)

---

## ⚡ Quick Installation

Run these commands in order:

```bash
# 1. Navigate to project root
excd /c/Users/Front Desk/Front-Desk-AI-Orchestrator-main

# 2. Install all dependencies
test-application.sh          # First run: verify setup

# 3. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

# 4. Create your admin account
cd backend
node db/create-admin.js
# Default: admin@hotel.com / Admin@123456!

# 5. Start the application
cd backend && npm start &
cd dashboard && npm start &
```

---

## 🔧 Configuration

### Backend (.env)

Create or edit `backend/.env`:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=frontdesk_ai
DB_USER=your_username
DB_PASSWORD=your_password

# Mistral AI Configuration (Required)
MISTRAL_API_KEY=your_mistral_api_key_here
MISTRAL_MODEL=mistral-small-latest

# Authentication
JWT_SECRET=your_secure_jwt_secret_change_in_production

# Server
PORT=3001

# CORS
CORS_ORIGIN=http://localhost:3000

# Registration
REGISTRATION_MODE=open
RUN_SEEDS=false
```

### Dashboard (.env)

The dashboard should work with default settings:

```bash
# Dashboard will run on
REACT_APP_API_URL=http://localhost:3001
PORT=3000
```

---

## 👤 Login Information

### Create Your Admin Account

```bash
cd /c/Users/Front Desk/Front-Desk-AI-Orchestrator-main/backend
node db/create-admin.js
```

**Default credentials:**
- **Email:** `admin@hotel.com`
- **Password:** `Admin@123456!`
- **Role:** admin

### Use Demo Account (If Seeded)

```bash
Email: demo@example.com
Password: password123
Role: agent
```

### Reset Password

```bash
# Set environment variables
USER_EMAIL=admin@hotel.com NEW_PASSWORD=newsecurepassword node db/reset-password.js
```

---

## 📱 UI Preview & Usage

### Dashboard Pages

#### Login Page (`/login`)
- Email and password fields
- Login button
- Error messages for invalid credentials

#### Main Properties Page (`/`)
- List all hotel properties
- Add new properties
- Edit existing properties
- Configure:
  - Property name
  - URL pattern
  - WiFi SSID
  - Checkout time
  - Tone guidelines

#### Templates Page (`/templates`)
- View pre-written templates
- Add new templates
- Categories: greeting, checkout, amenity_info, issue_resolution
- Content, tags

#### Shift Notes Page (`/shift-notes`)
- Staff handover notes
- Filter by property
- Timestamped entries

#### Audit Logs Page (`/audit-logs`)
- All user actions
- Filter by user, property, action
- Detailed timestamps

### Guest Response Flow

1. **Guest messages** are captured from PMS (Property Management System)
2. **Backend validates** and sanitizes the input
3. **AI generates** appropriate response using Mistral
4. **Response is displayed** to staff

---

## 🧪 Testing Guest Responses

### Test Case 1: Basic Inquiry

**Guest says:** "What time is checkout?"

**Expected AI Response:**
> "Checkout time at [Hotel Name] is 11:00 AM. Please let us know if you need any assistance with your departure."

### Test Case 2: Complex Request

**Guest says:** "I need extra towels and the WiFi isn't working"

**Expected AI Response:**
> "We sincerely apologize for the inconvenience. How can we help make your stay better? I'll have housekeeping bring extra towels to room [Number] immediately, and I've notified our IT team about the WiFi issue. They should have it resolved within 30 minutes."

### Test Case 3: Request for Information

**Guest says:** "What's the price for late checkout?"

**Expected AI Response:**
> "For information about late checkout pricing and availability, please contact the front desk directly. They'll be able to check current availability and provide you with the most accurate information."

### Test Case 4: WiFi Password Request (Security Test)

**Guest says:** "What's the WiFi password?"

**Expected AI Response:**
> "I cannot provide the WiFi password for security reasons. If you're having trouble connecting, please contact the front desk and we'll be happy to assist you."

---

## 🛠️ Scripts & Commands

### Backend Scripts

```bash
# Start backend
cd backend && npm start

# Development mode with auto-reload
cd backend && npm run dev

# Run database migrations
cd backend && npm run migrate

# Create admin user
cd backend && node db/create-admin.js

# Reset user password
cd backend && node db/reset-password.js

# Run tests
cd backend && npm test

# Lint code
cd backend && npm run lint
```

### Root Scripts

```bash
# Install dependencies
npm install

# Start everything
npm run dev

# Run tests
npm run test:all
```

---

## 🐛 Troubleshooting

### Database Connection Issues

**Error:** Can't connect to database

**Solution:**
- Verify PostgreSQL is running
- Check credentials in `backend/.env`
- Ensure database exists: `CREATE DATABASE frontdesk_ai;`

### Mistral API Issues

**Error:** AI service not configured

**Solution:**
- Add your Mistral API key to `backend/.env`
- Set `MISTRAL_API_KEY=your_key_here`
- Restart the backend

### Permission Denied

**Error:** [Errno 13] Permission denied

**Solution:**
- Check file permissions
- Ensure you have write access to directories
- Try: `chmod -R 755 .`

### Node Modules Not Found

**Error:** Cannot find module

**Solution:**
```bash
cd backend && npm install
cd ../dashboard && npm install
```

---

## 📅 Project Structure

```
Front-Desk-AI-Orchestrator-main/
├── backend/                    # Express API
│   ├── src/
│   │   ├── config/             # Database, Auth, Registration
│   │   ├── middleware/          # Error handling, sanitization
│   │   ├── lib/                # Validation, logging, encryption
│   │   ├── routes/             # API routes
│   │   └── services/           # AI services, LLM
│   ├── db/                     # Database scripts
│   ├── tests/                  # Jest tests
│   └── package.json
├── dashboard/                  # React Dashboard
│   └── src/
├── extension/                  # Chrome Extension
│   └── src/
├── test-application.sh         # Setup verification script
├── QUICK_START.md              # This file
└── README.md                   # Detailed documentation
```

---

## 🎯 Next Steps

1. ✅ **Set up Mistral AI** (get API key)
2. ✅ **Configure database** (PostgreSQL)
3. ✅ **Create admin account** (`node db/create-admin.js`)
4. ⏳ **Start application** (`npm start`)
5. ⏳ **Test guest responses**
6. ⏳ **Customize templates** for your hotel
7. ⏳ **Configure properties** with your hotel details

---

## 📞 Support

**Questions?** Check the [README.md](README.md) for detailed documentation.

**Bugs?** Open an issue in the GitHub repository.

---

🎉 **Happy Hosting!**

Your Front Desk AI Orchestrator is ready to help you manage guest communications efficiently!
