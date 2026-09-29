# Campus Clubs Portal

A university clubs showcase website inspired by **Amrita Vishwa Vidyapeetham**, backed by **Firebase**.

---

## 🚀 Quick Start (Local Preview)

Because the site uses Firebase SDKs, it **cannot** be opened directly as a `file://` URL.
You need a local HTTP server. The easiest options:

### Option A — VS Code Live Server (recommended)
1. Install the **Live Server** extension in VS Code
2. Right-click `index.html` → **Open with Live Server**

### Option B — Python
```bash
# Python 3
python -m http.server 5500
# then open http://localhost:5500
```

### Option C — Node.js
```bash
npx serve .
```

---

## 🔥 Firebase Setup

### 1. Set Firestore & Storage Rules
In the [Firebase Console](https://console.firebase.google.com/project/portal-1feca):

**Firestore → Rules** — paste the contents of `firestore.rules`  
**Storage → Rules** — paste the contents of `storage.rules`

Click **Publish** for each.

### 2. Enable Storage
Go to **Storage** in the Firebase Console and click **Get Started** (if not already done).
Choose any region (e.g., `asia-south1` for India).

### 3. Seed Passwords (automatic)
On first admin login, the app will automatically create a `config/passwords` document
in Firestore with the default passwords:

| Role | Password | Access |
|------|----------|--------|
| A1 — Full Admin | `Admin@1` | Add, Edit, Delete |
| A2 — Editor | `admin2` | Add, Edit only |

To **change passwords**: open Firestore Console → `config` → `passwords`
and edit the `a1` / `a2` fields directly.

---

## 🌐 Deploy to Firebase Hosting

```bash
# Install Firebase CLI (once)
npm install -g firebase-tools

# Login
firebase login

# Deploy everything (hosting + rules)
firebase deploy --project portal-1feca
```

Your site will be live at: **https://portal-1feca.web.app**

---

## 📂 File Structure

```
peaceful-planck/
├── index.html          # Main SPA entry point
├── style.css           # Amrita-inspired theme
├── firebase-config.js  # Firebase init + CRUD helpers
├── app.js              # SPA logic, rendering, admin controls
├── firestore.rules     # Firestore security rules
├── storage.rules       # Firebase Storage rules
├── firebase.json       # Firebase Hosting + rules config
└── README.md           # This file
```

---

## ✨ Features

| Feature | Details |
|---------|---------|
| **Club Grid** | Responsive grid of club logo cards |
| **Club Detail** | Slide-in panel with logo, mission, about, achievements, joining info, contact |
| **Achievement Gallery** | Up to **15 images** per club with lightbox viewer |
| **Admin A1** (`Admin@1`) | Add · Edit · Delete clubs |
| **Admin A2** (`admin2`) | Add · Edit clubs (no delete) |
| **Passwords in Firebase** | Stored in `config/passwords` Firestore document |
| **Real-time Updates** | Firestore `onSnapshot` — changes appear instantly |
| **Image Upload** | Logo + achievements stored in Firebase Storage |
| **Search** | Live search bar filters clubs by name |
| **Responsive** | Mobile, tablet, desktop layouts |
| **Keyboard Support** | Esc closes panels; arrow keys navigate lightbox |

---

## 🔐 Admin Password Management

Passwords are stored in Firestore at: `config` → `passwords`

```
{
  a1: "Admin@1",   // Full Admin
  a2: "admin2"     // Editor
}
```

Change them any time from the Firestore Console. No code change needed.

---

## ⚙️ Club Data Model (Firestore)

Collection: `clubs`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Club name |
| `logoUrl` | string | Firebase Storage URL |
| `clubHead` | string | Name of club head |
| `mission` | string | Club mission |
| `aboutClub` | string | About the club |
| `achievements` | array | `[{ caption, imageUrl }]` — max 15 |
| `joiningProcedure` | string | How to join |
| `contact` | string | Phone / email / social |
| `createdAt` | timestamp | Auto-set on creation |
| `updatedAt` | timestamp | Auto-set on edit |
