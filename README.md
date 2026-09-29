# Campus Clubs Portal (Supabase Edition)

A university clubs showcase portal inspired by **Amrita Vishwa Vidyapeetham**, backed by **Supabase** (PostgreSQL + Real-time + Storage) with automatic **Google Sheets** syncing.

---

## ⚡ 2-Minute Supabase Setup Guide

### 1. Create a Free Supabase Project
1. Go to **[supabase.com](https://supabase.com)** and sign in (free).
2. Click **New Project**, choose a project name (e.g. `campus-clubs-portal`) and set a database password.

### 2. Run the SQL Schema
1. In your Supabase project dashboard, open the **SQL Editor** on the left menu.
2. Click **New Query**.
3. Open `supabase-schema.sql` from this repository, copy all contents, paste it into the editor, and click **Run**.
*(This creates the `clubs` table, `config` table with admin passwords, row security policies, and real-time triggers).*

### 3. Create a Public Storage Bucket for Images
1. Go to **Storage** on the left menu.
2. Click **New bucket**.
3. Name it: **`club-assets`**
4. **IMPORTANT:** Turn the toggle **"Public bucket"** to **ON** (green).
5. Click **Save**.

### 4. Connect to Your Website
1. Go to **Project Settings** (gear icon) → **API**.
2. Copy your **Project URL** and **anon public Key**.
3. Open [`supabase-config.js`](supabase-config.js) and paste them at the top:
   ```javascript
   const SUPABASE_URL = 'https://xyzcompany.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

---

## 🔐 Administrator Access

Admin passwords are automatically loaded from your Supabase `config` table:

| Role | Password | Capabilities |
|------|----------|-------------|
| **A1 — Full Admin** | `Admin@1` | Add, Edit, and Delete clubs |
| **A2 — Editor** | `admin2` | Add & Edit clubs (cannot delete) |

To change passwords at any time: Go to Supabase Dashboard → **Table Editor** → `config` table → update the `passwords` row.

---

## 📊 Optional: Google Sheets Sync

1. Open `apps-script.gs`, follow the setup comments to deploy it as a Google Apps Script Web App.
2. Paste the Web App URL into `app.js` on line 9 (`const SHEETS_WEBHOOK_URL = '...'`).

---

## 📂 Project Structure

```
peaceful-planck/
├── index.html           # Main SPA layout
├── style.css            # Amrita-inspired design system
├── app.js               # UI logic, routing, admin controls, lightbox
├── supabase-config.js   # Supabase client, storage uploads, CRUD helpers
├── supabase-schema.sql  # Database schema & security rules
├── apps-script.gs       # Google Sheets sync script
└── README.md            # Documentation
```
