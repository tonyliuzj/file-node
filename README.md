# File Node

File Node is a Next.js-powered self-hosted file explorer that indexes and browses files (PDF, MP4, images, audio, markdown, text, etc.) stored on one or more remote HTTP directory-listing backends. You run a small frontend that proxies and catalogs content in SQLite, while storage backends live on shared hosting, a local file server, or any HTTP server with directory listing enabled.

## Features

- **Fast search** by filename across the local SQLite index
- **Explorer UI**: navigate folder hierarchies with breadcrumb navigation
- **Inline viewer** for PDFs, images, video, audio, markdown, and text files (uses HTTP Range requests)
- **Auto-rescan**: background cron job scans backends at configured intervals
- **Admin panel**: add/edit/delete backends, name them, configure auth and scan intervals
- **First-run setup**: create the initial local admin account from the browser
- **Admin settings**: update credentials and configure Cloudflare Turnstile protection
- **NextAuth** credentials provider: only admins can manage backends
- Backend Basic auth passwords are encrypted at rest and never returned in JSON
- Optional Turnstile gates for browse, search, and admin sign-in routes
- Guests can browse & view files without seeing backend URLs
- **Modern app UI** built with shadcn/ui components, Tailwind CSS, and Sonner notifications

## Prerequisites

- **Node.js** ≥18
- **npm** or **yarn**
- **VPS** or server with public HTTPS (for production)
- Shared HTTP/WebDAV storage backends with directory listing enabled

## Getting Started

### Run by script (One Click Install)

```bash
curl -sSL https://github.com/tonyliuzj/file-node/releases/latest/download/file-node.sh -o file-node.sh && chmod +x file-node.sh && bash file-node.sh
```

### Manual Installation

1. **Clone the repo**

   ```bash
   git clone https://github.com/tonyliuzj/file-node.git
   cd file-node
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment variables**

   Copy `example.env.local` to `.env.local` if you want to override the port
   or pin a credential-encryption secret. Turnstile keys are configured later
   from the admin settings screen.

   ```
   FILE_NODE_SECRET_KEY=optional-separate-secret-for-backend-credential-encryption
   PORT=3000
   ```

4. **Run in development**

   ```bash
   npm run dev
   # opens http://localhost:3000
   ```

5. **Build & start production**

   ```bash
   npm run build
   npm start
   ```

## Project Structure

```
file-node/
├── .env.local               # your secrets
├── data/                    # SQLite database and generated local secret
├── next.config.ts
├── package.json
├── src/
│   ├── instrumentation.ts   # background cron scanner (runs on server start)
│   ├── utils/
│   │   ├── db.ts            # SQLite schema and connection
│   │   └── scanner.ts       # indexer logic
│   ├── lib/
│   │   ├── auth.ts          # NextAuth configuration
│   │   ├── turnstile.ts     # Turnstile settings, verification, and clearance cookies
│   │   └── utils.ts         # utility functions
│   ├── components/
│   │   ├── turnstile-gate.tsx
│   │   ├── turnstile-widget.tsx
│   │   └── ui/              # shadcn/ui components and Sonner toaster
│   └── app/
│       ├── api/
│       │   ├── admin/settings/route.ts
│       │   ├── auth/[...nextauth]/route.ts
│       │   ├── backends/
│       │   │   ├── route.ts
│       │   │   └── scan/route.ts
│       │   └── files/
│       │       ├── explorer/route.ts
│       │       ├── search/route.ts
│       │       └── view/route.ts
│       ├── admin/
│       │   ├── (authenticated)/
│       │   │   ├── backends/page.tsx
│       │   │   ├── settings/page.tsx
│       │   │   └── layout.tsx
│       │   ├── signin/page.tsx
│       │   └── page.tsx
│       ├── files/
│       │   ├── [fileId]/page.tsx    # file viewer with dynamic routing
│       │   ├── browse/page.tsx      # file explorer
│       │   └── search/page.tsx      # search interface
│       ├── nav-bar.tsx
│       ├── layout.tsx
│       └── page.tsx
├── tailwind.config.js
└── tsconfig.json
```

## Configuration

### Backends

* **Name**: human-readable label (defaults to URL if blank)
* **URL**: root of remote directory listing
* **Auth**: optional Basic auth (username & password)
* **Auto-rescan interval**: "Never" or X minutes

### Environment Variables

| Variable          | Description                             |
| ----------------- | --------------------------------------- |
| `FILE_NODE_SECRET_KEY` | Optional persistent server secret for backend credential encryption |
| `PORT` | Optional port for local/systemd startup |

### Initial Setup

On first run, or whenever the database has no users, open `/setup` to create
the first local admin account. The setup API is disabled automatically after the
first user exists. Passwords are stored with bcrypt.

### Bot Protection

Cloudflare Turnstile is optional. After signing in, open `/admin/settings` to
store the site key and secret key, then choose whether browse, search, and admin
sign-in require verification. Turnstile secret keys are encrypted at rest with
the same credential protection used for backend passwords. Successful public
verifications are not remembered by default. The validation time defaults to 0
minutes, which requires verification on each new visit. Set a positive
validation time to remember browse/search verification for that many minutes.

## Usage

* **Guest users**

  * Home: `/` - Dashboard with index and backend status
  * Search: `/files/search?q=filename` - Search for files across all backends
  * Browse: `/files/browse?backendId=<ID>&path=/<folder>/` - Navigate folder hierarchies
  * View: `/files/<fileId>` - View individual files (PDF, images, video, audio, markdown, text)

* **Admin users** (after logging in at `/admin/signin`)

  * Admin panel: `/admin/backends` - Manage storage backends
  * Settings: `/admin/settings` - Change credentials and configure Turnstile
  * Add, edit, delete backends
  * Trigger manual rescans

## API Endpoints

* **`GET /api/backends`**
  Public requests receive safe backend metadata. Admin sessions also receive URLs, scan settings, scan timestamps, and index counts. Passwords are never returned.
* **`POST/PUT/DELETE /api/backends`**
  Admin-only: create, update, delete backends.
* **`POST /api/backends/scan`**
  Admin-only: trigger manual rescan of a specific backend.
* **`GET/PATCH/PUT /api/admin/settings`**
  Admin-only: read Turnstile settings, update Turnstile settings, or update admin credentials.
* **`POST /api/setup`**
  Creates the first admin user while setup is available.
* **`POST /api/turnstile/verify`**
  Verifies a Turnstile token for browse or search and returns a clearance. A cookie is set only when validation time is greater than 0.
* **`GET /api/files/search?q=`**
  Public: search for files by name across all backends. May require Turnstile verification if enabled.
* **`GET /api/files/explorer?backendId=&path=`**
  Public: list directory entries for a specific backend and path. May require Turnstile verification if enabled.
* **`GET /api/files/view?backendId=&path=`**
  Public: proxy and stream files (supports HTTP Range requests for video/audio).

## Security

* Backend passwords are encrypted at rest with `FILE_NODE_SECRET_KEY` or a generated persistent secret in `data/secret.key`. Existing `LIBRIX_SECRET_KEY` and `NEXTAUTH_SECRET` deployments remain supported as fallbacks.
* Turnstile secret keys are encrypted before being stored in the SQLite settings table.
* Guests cannot access admin APIs or backend credentials.
* Admin panel and mutating routes require NextAuth credentials.
* Optional Turnstile checks can protect browse, search, and admin sign-in.
* File proxy requests are checked against the indexed backend root and return `X-Content-Type-Options: nosniff`.

---
