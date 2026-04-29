# 🚀 Source One — Self-Hosted Deployment Guide

> **Audience:** Client technical team deploying Source One on their own infrastructure.  
> **Maintained by:** ViacoreMedia Engineering  
> **Last Updated:** April 2026

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository Access & Cloning](#2-repository-access--cloning)
3. [MongoDB Atlas Setup (Cloud Database)](#3-mongodb-atlas-setup-cloud-database)
4. [Environment Configuration](#4-environment-configuration)
5. [Server Setup (Backend)](#5-server-setup-backend)
6. [Client Setup (Frontend)](#6-client-setup-frontend)
7. [Running the Full Stack Locally](#7-running-the-full-stack-locally)
8. [Seeding Your First Admin User](#8-seeding-your-first-admin-user)
9. [Webhook Integration (Daily CSV Ingestion)](#9-webhook-integration-daily-csv-ingestion)
10. [Remote Database Access for ViacoreMedia](#10-remote-database-access-for-viacoremedia)
11. [Vercel Deployment (Production)](#11-vercel-deployment-production)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Install the following on the machine that will run Source One:

| Tool        | Minimum Version | Download                                |
|-------------|-----------------|------------------------------------------|
| **Node.js** | v18.x or later  | https://nodejs.org/en/download           |
| **npm**     | v9.x or later   | *(bundled with Node.js)*                 |
| **Git**     | v2.30+          | https://git-scm.com/downloads            |

### Verify Installation

```bash
node -v    # Should print v18.x.x or higher
npm -v     # Should print 9.x.x or higher
git --version
```

> **Windows Users:** We recommend using **Git Bash** or **WSL2** (Windows Subsystem for Linux). All commands in this guide assume a Unix-style terminal. If using PowerShell, adjust path separators (`\` vs `/`) as needed.

---

## 2. Repository Access & Cloning

You will be added as a collaborator on our private GitHub repository.

### Accept the Invitation

1. Check the email associated with your GitHub account for a repository invitation
2. Click **Accept Invitation**

### Clone the Repository

```bash
git clone https://github.com/viacoremedia/viacore-v2.git
cd "viacore-v2/Source One"
```

### Project Structure

```
Source One/
├── client/                     # Frontend — Vite + React (TypeScript)
│   ├── src/
│   │   ├── core/               # Shared components, hooks, services, styles
│   │   ├── features/           # Feature modules (dashboard, etc.)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env.development        # Dev environment config (YOU CREATE THIS)
│   ├── .env.production         # Prod environment config (YOU CREATE THIS)
│   ├── vite.config.ts          # Vite + proxy config
│   └── package.json            # Frontend dependencies
│
├── server/                     # Backend — Express + Node.js (JavaScript)
│   ├── index.js                # Express entry point (port 3000)
│   ├── models/                 # Mongoose schemas (11 collections)
│   ├── routes/                 # API routes (analytics, reports, auth)
│   ├── services/               # Business logic (CSV parsing, rollups, etc.)
│   ├── webhook/                # Webhook receiver for daily CSV ingestion
│   ├── middleware/              # Auth middleware
│   ├── scripts/                # One-off admin/maintenance scripts
│   ├── .env                    # Server environment config (YOU CREATE THIS)
│   ├── vercel.json             # Vercel deployment config
│   └── package.json            # Backend dependencies
│
├── docs/                       # Internal documentation
├── CHANGELOG.md
└── README.md
```

---

## 3. MongoDB Atlas Setup (Cloud Database)

Source One uses **MongoDB Atlas** — a fully managed cloud database. You'll create your own cluster so your data lives on your infrastructure.

### Step 3.1 — Create a MongoDB Atlas Account

1. Go to **https://www.mongodb.com/cloud/atlas**
2. Click **"Try Free"** and sign up (or use Google SSO)
3. Complete the onboarding survey (select **JavaScript** as your language)

### Step 3.2 — Create a Project

1. From the Atlas dashboard, click **"New Project"** in the left sidebar
2. Name it: `Source-One-Production` (or whatever you prefer)
3. Click **"Create Project"**

### Step 3.3 — Deploy a Cluster

1. Inside the project, click **"Build a Database"** (or "Create Deployment")
2. Choose your tier:

| Tier                | Cost        | Best For                     |
|---------------------|-------------|-------------------------------|
| **M0 (Free)**       | $0/mo       | Development & testing only    |
| **M10 (Shared)**    | ~$57/mo     | Small production workloads    |
| **M30 (Dedicated)** | ~$175+/mo   | Full production workloads     |

3. **Cloud Provider:** Select **AWS** (recommended)
4. **Region:** Pick the region closest to your users:
   - US East (Virginia) — `us-east-1`
   - US West (Oregon) — `us-west-2`
   - Or your nearest region
5. **Cluster Name:** `source-one` (cannot be changed later)
6. Click **"Create Deployment"**

> ⏱️ Cluster provisioning takes 1–3 minutes.

### Step 3.4 — Create a Database User

Atlas will prompt you during cluster creation:

1. **Authentication:** Select **Password**
2. **Username:** `sourceone_db_user` (or your choice)
3. **Password:** Generate a strong password
   - ⚠️ **IMPORTANT:** Do **NOT** use `@`, `/`, `:`, or `%` in the password — these break the MongoDB URI encoding. Stick to letters, numbers, `!`, and `_`.
4. **Save the password somewhere secure** — you'll need it shortly
5. Click **"Create User"**

### Step 3.5 — Configure Network Access (IP Allowlist)

This controls which IPs can connect to your database.

1. Go to **"Network Access"** in the left sidebar (under Security)
2. Click **"Add IP Address"**
3. **For development:** Click **"Allow Access from Anywhere"** — adds `0.0.0.0/0`
   - ⚠️ This is fine for dev/testing. For production, restrict to specific IPs.
4. **For production:** Add:
   - Your server's public IP address
   - ViacoreMedia's IP addresses (we will provide these — see [Section 10](#10-remote-database-access-for-viacoremedia))
5. Click **"Confirm"**

### Step 3.6 — Get Your Connection String

1. Go to **"Database"** → click **"Connect"** on your cluster
2. Select **"Drivers"** (Connect your application)
3. **Driver:** `Node.js` — **Version:** `6.0 or later`
4. Copy the connection string:

```
mongodb+srv://<username>:<password>@source-one.abc123.mongodb.net/?retryWrites=true&w=majority&appName=source-one
```

5. **Replace the placeholders** with your actual credentials:

```
mongodb+srv://sourceone_db_user:YourPassword123@source-one.abc123.mongodb.net/?retryWrites=true&w=majority&appName=source-one
```

> 📋 **Save this connection string.** You'll use it in your `.env` file.

### Step 3.7 — Database & Collections

The application will **auto-create all collections** when the server first connects and processes data. No manual collection setup needed. The system uses these collections:

| Collection              | Purpose                                                 |
|-------------------------|---------------------------------------------------------|
| `dailydealersnapshots`  | One record per dealer per day (activity + metrics)      |
| `dealergroups`          | Multi-location brand groupings                          |
| `dealerlocations`       | Individual dealer location records                      |
| `fileingestionlogs`     | Audit trail of every CSV file processed                 |
| `largedealerbudgets`    | Budget data for large dealer accounts                   |
| `monthlydealerrollups`  | Aggregated monthly metrics per dealer                   |
| `reportrecipients`      | Email recipients for automated reports                  |
| `salesbudgets`          | Sales budget / target tracking                          |
| `users`                 | Application user accounts (login credentials)           |
| `webhooklogs`           | Audit trail of webhook events                           |
| `webhookpayloads`       | Raw CSV payloads stored for reprocessing                |

---

## 4. Environment Configuration

Environment variables are stored in `.env` files that are **never committed to Git**. You must create these yourself.

### Step 4.1 — Server Environment (`server/.env`)

Create the file `server/.env`:

```bash
cd server
cp .env.example .env    # If the template exists, or create manually:
```

Paste the following and fill in your values:

```env
# ── DATABASE ──────────────────────────────────────
# Paste your MongoDB Atlas connection string from Step 3.6
MONGODB_URI="mongodb+srv://YOUR_USER:YOUR_PASS@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority&appName=YOUR_CLUSTER"

# ── EMAIL (SMTP) ─────────────────────────────────
# Used for automated weekly/monthly dealer reports
# Gmail: enable 2FA, then create an App Password at https://myaccount.google.com/apppasswords
# Outlook/365: use your email + an app-specific password
SMTP_USER="your-email@yourdomain.com"
PASSWORD="your-app-specific-password"

# ── CLIENT URL ────────────────────────────────────
# The URL of your frontend (used for CORS + email links)
# Development: http://localhost:5173
# Production: https://your-production-domain.com
CLIENT_URL="http://localhost:5173"
```

> **That's it.** Source One's server only needs these 4 variables. No API keys, no third-party integrations required for core functionality.

### Step 4.2 — Client Environment (Frontend)

Create **two** files in the `client/` directory:

**`client/.env.development`** — Used during local development (`npm run dev`):

```env
VITE_API_URL=http://localhost:3000
```

**`client/.env.production`** — Used when building for production (`npm run build`):

```env
VITE_API_URL=https://your-production-server-domain.com
```

> **Note:** In development mode, the Vite dev server proxies API calls to `localhost:3000` automatically (configured in `vite.config.ts`), so the `VITE_API_URL` in dev mode is mainly a fallback. The proxy handles `/analytics`, `/webhook`, `/auth`, and `/reports` routes.

---

## 5. Server Setup (Backend)

### Step 5.1 — Install Dependencies

```bash
cd server
npm install
```

This installs: Express, Mongoose, cors, dotenv, bcryptjs, jsonwebtoken, multer, nodemailer, busboy, and nodemon.

### Step 5.2 — Verify `.env`

Confirm `server/.env` exists and contains your `MONGODB_URI`.

### Step 5.3 — Start the Server

```bash
npm run dev
```

You should see:

```
Server listening on port 3000
DATABASE CONNECTED
```

### Step 5.4 — Test the Connection

```bash
curl http://localhost:3000/ping-db
```

Expected response:

```json
{ "Message": "DB ping successful", "Success": true }
```

If you see `"DB ping failed"`, double-check your `MONGODB_URI` and network access settings in Atlas.

---

## 6. Client Setup (Frontend)

### Step 6.1 — Install Dependencies

```bash
cd client
npm install
```

### Step 6.2 — Verify Environment Files

Make sure `client/.env.development` exists with:

```env
VITE_API_URL=http://localhost:3000
```

### Step 6.3 — Start the Dev Server

```bash
npm run dev
```

The Vite dev server starts on:

```
http://localhost:5173
```

Open this URL in your browser. You should see the Source One login page.

> **Proxy Note:** The Vite config automatically proxies `/analytics`, `/webhook`, `/auth`, and `/reports` requests to `http://localhost:3000`. You don't need to configure anything extra for local development.

---

## 7. Running the Full Stack Locally

You need **two terminal windows** — one for the backend, one for the frontend.

### Terminal 1 — Backend

```bash
cd "Source One/server"
npm start
```

### Terminal 2 — Frontend

```bash
cd "Source One/client"
npm run dev
```

### Verification Checklist

| ✅ Check                            | Expected Result                                   |
|-------------------------------------|---------------------------------------------------|
| Server running                      | `Server listening on port 3000` in Terminal 1     |
| Database connected                  | `DATABASE CONNECTED` in Terminal 1                |
| Client running                      | `http://localhost:5173` loads in browser           |
| DB ping works                       | `curl localhost:3000/ping-db` returns success     |
| Login page visible                  | Browser shows the Source One login screen         |

---

## 8. Seeding Your First Admin User

Before you can log in, you need to create an admin user account.

### Using the Seed Script

```bash
cd server
node scripts/seedAdmin.js
```

This will create a default admin user. Check the script for the default credentials, then change the password after your first login.

> **If the seed script is not configured for your needs**, you can create a user directly via the API or by inserting into MongoDB Atlas manually:
>
> 1. Go to your Atlas cluster → **Browse Collections** → `users` collection
> 2. Click **Insert Document**
> 3. Use the schema from `server/models/User.js` as a reference

---

## 9. Webhook Integration (Daily CSV Ingestion)

Source One receives daily dealer performance data via a CSV webhook. Here's how the data pipeline works:

```
Daily CSV → POST /webhook → csvParserService → dealerGroupDetector
                                              → dealerMetricsIngestionService
                                              → DailyDealerSnapshot (MongoDB)
                                              → rollupService (monthly aggregates)
```

### Webhook Endpoint

| Property       | Value                                            |
|----------------|--------------------------------------------------|
| **URL (Local)**      | `http://localhost:3000/webhook`              |
| **URL (Production)** | `https://your-server-domain.com/webhook`     |
| **Method**     | `POST`                                           |
| **Content-Type** | `multipart/form-data`, `text/csv`, or raw binary |

### Testing the Webhook

```bash
# Multipart file upload
curl -X POST "http://localhost:3000/webhook" \
  -F "file=@/path/to/your/test_file.csv" \
  -F "source=omni-bi"

# Raw CSV body
curl -X POST "http://localhost:3000/webhook" \
  -H "Content-Type: text/csv" \
  -H "X-Filename: daily_report.csv" \
  --data-binary @/path/to/your/test_file.csv
```

### Health Check

```bash
curl http://localhost:3000/webhook/health
```

Returns server status, database connectivity, and last webhook timestamp.

> 📖 For the full webhook specification (headers, response codes, diagnostic endpoints), see **`server/WEBHOOK_GUIDE.md`**.

---

## 10. Remote Database Access for ViacoreMedia

As part of our support agreement, ViacoreMedia needs remote access to your MongoDB Atlas database for:

- Pushing software updates that require data migrations
- Debugging production issues
- Running maintenance/backfill scripts
- Monitoring database health

### What You Need to Do

#### A. Create a Dedicated Database User for Us (Recommended)

1. In Atlas → **Database Access** → **Add New Database User**
2. **Username:** `viacoremedia_support`
3. **Password:** Generate a strong password
4. **Role:** `readWriteAnyDatabase` (or `Atlas admin` for full maintenance access)
5. Share the credentials with us via a secure channel (encrypted email, password manager, or direct message)

#### B. Allowlist Our IP Addresses

1. In Atlas → **Network Access** → **Add IP Address**
2. We will provide our static IP address(es)
3. Add each with a comment: `ViacoreMedia — Remote Support`
4. Click **Confirm**

#### C. Share the Connection String

Send us the full `mongodb+srv://...` URI with the `viacoremedia_support` user credentials. We'll use this for maintenance scripts and migrations only.

### What We'll Provide to You

| Item                       | Description                                     |
|----------------------------|-------------------------------------------------|
| Static IP address(es)      | For your Atlas network allowlist                |
| GitHub repository access   | Collaborator invitation for code access          |
| Deployment documentation   | This guide + webhook integration docs            |

> **Security Note:** Using a dedicated database user for us means you can **revoke our access at any time** without affecting your application's own database user. We recommend this approach.

---

## 11. Vercel Deployment (Production)

To make Source One accessible on the internet (beyond localhost), deploy to **Vercel**.

### Deploy the Server (API)

1. Create a [Vercel account](https://vercel.com)
2. Click **"Add New Project"** → **Import** your GitHub repo
3. **Root Directory:** `Source One/server`
4. **Framework Preset:** Other
5. Add environment variables in **Settings → Environment Variables**:
   - `MONGODB_URI` — your Atlas connection string
   - `SMTP_USER` — your email
   - `PASSWORD` — your app-specific email password
   - `CLIENT_URL` — your frontend production URL
6. Click **Deploy**

The `server/vercel.json` is pre-configured to handle this.

### Deploy the Client (Frontend)

1. In Vercel, create a **second project**
2. **Root Directory:** `Source One/client`
3. **Framework Preset:** Vite
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. Add environment variable:
   - `VITE_API_URL` — your deployed server URL (e.g., `https://source-one-api.vercel.app`)
7. Click **Deploy**

The `client/vercel.json` with its SPA rewrite rule is pre-configured.

### Post-Deployment Checklist

- [ ] Update `server/.env` → `CLIENT_URL` to match your new frontend domain
- [ ] Verify CORS: the server uses `cors()` with no restrictive origin list by default — this works for all origins. If you want to restrict it, update `index.js`.
- [ ] Test: `curl https://your-server.vercel.app/ping-db`
- [ ] Test: Open your frontend URL in a browser and log in

---

## 12. Troubleshooting

### ❌ "MongoServerError: bad auth" / "Authentication failed"

- Double-check `MONGODB_URI` in `server/.env`
- Ensure username + password match what you set in Atlas
- Passwords with `@`, `:`, `/`, `%` break the URI — avoid these characters

### ❌ "MongoNetworkError: connection timed out"

- Your IP is not in the Atlas allowlist
- Go to **Network Access** → add your current IP
- Check your IP at: https://whatismyip.com

### ❌ Server starts but client shows "Network Error"

- Ensure the server is running on port 3000 (`npm run dev` in `server/`)
- Ensure `client/.env.development` has `VITE_API_URL=http://localhost:3000`
- The Vite proxy in `vite.config.ts` should handle routing automatically

### ❌ "ENOENT" / "Cannot find module"

- Run `npm install` in **both** `client/` and `server/` directories

### ❌ Port 3000 or 5173 already in use

```bash
# Mac/Linux — kill process on port
lsof -ti:3000 | xargs kill -9
lsof -ti:5173 | xargs kill -9

# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
Get-Process -Id (Get-NetTCPConnection -LocalPort 5173).OwningProcess | Stop-Process -Force
```

### ❌ Webhook returns 400 "Empty payload"

- Ensure the CSV file is being sent correctly (multipart or raw body)
- Test with `curl` using the examples in [Section 9](#9-webhook-integration-daily-csv-ingestion)
- Check `server/WEBHOOK_GUIDE.md` for full troubleshooting

### ❌ "DATABASE CONNECTED" never appears

- Verify your `MONGODB_URI` is correct and complete
- Ensure your IP is allowlisted in Atlas → Network Access
- Try `0.0.0.0/0` temporarily to rule out IP issues
- Check that the Atlas cluster is **active** (not paused — free tier clusters pause after 60 days of inactivity)

---

## Quick Reference Card

```
┌──────────────────────────────────────────────────────┐
│  SOURCE ONE — QUICK START                            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  1. Clone:    git clone <repo-url>                   │
│               cd "viacore-v2/Source One"              │
│                                                      │
│  2. Server:   cd server && npm install               │
│               Create .env with MONGODB_URI           │
│               npm run dev                            │
│                                                      │
│  3. Client:   cd client && npm install               │
│               Create .env.development                │
│               npm run dev                            │
│                                                      │
│  4. Open:     http://localhost:5173                   │
│                                                      │
│  ─────────────────────────────────────────────────── │
│  Server API:    http://localhost:3000                 │
│  Client UI:     http://localhost:5173                 │
│  DB Ping:       GET /ping-db                         │
│  Webhook:       POST /webhook                        │
│  Health Check:  GET /webhook/health                  │
│  Database:      MongoDB Atlas (cloud)                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Support

Questions or issues? Contact the ViacoreMedia engineering team:

- **Email:** joshua@viacoremedia.com
- **GitHub:** Open an issue in the repository

---

*This guide is maintained by ViacoreMedia. Last updated April 2026.*
