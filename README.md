# File Node

File Node is a Next.js-powered self-hosted file explorer that indexes and browses files (PDF, MP4, images, audio, markdown, text, etc.) stored on one or more remote HTTP directory-listing backends. You run a small frontend that proxies and catalogs content in SQLite, while storage backends live on shared hosting, a local file server, or any HTTP server with directory listing enabled.

## Features

- **Fast search** by filename across the local SQLite index
- **Explorer UI**: navigate folder hierarchies with breadcrumb navigation
- **Inline viewer** for PDFs, images, video, audio, markdown, and text files (uses HTTP Range requests)
- **Auto-rescan**: background cron job scans backends at configured intervals; scans run in the background, so large backends never time out the admin page
- **File sizes and modified times** read from Apache, nginx and Lighttpd style listings
- **Admin panel**: add/edit/delete backends, name them, configure auth and scan intervals
- **First-run setup**: create the initial local admin account from the browser
- **Admin settings**: update credentials and configure Cloudflare Turnstile protection
- **NextAuth** credentials provider: only admins can manage backends
- Backend Basic auth passwords are encrypted at rest and never returned in JSON
- Optional Turnstile gates for browse, search, and admin sign-in routes
- Guests can browse & view files without seeing backend URLs
- **Modern app UI** built with shadcn/ui components, Tailwind CSS, and Sonner notifications

## Prerequisites

- **Docker** with Compose v2 for the Docker install path
- **Node.js** ≥20.9 and **npm** for direct/manual installs
- **VPS** or server with public HTTPS (for production)
- Shared HTTP/WebDAV storage backends with directory listing enabled

## Getting Started

### Run by script

For Linux servers (Debian/Ubuntu), download and run the installer. It supports both a direct systemd deployment and a Docker Compose deployment, and shows a menu: **Install**, **Update**, **Start**, **Stop**, **Restart**, **Status**, **Logs** and **Uninstall**.

```bash
curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors https://github.com/tonyliuzj/file-node/releases/latest/download/file-node.sh -o file-node.sh && chmod +x file-node.sh && bash file-node.sh
```

The Docker path pulls `tonyliuzj/file-node:latest` from Docker Hub and falls back to a local build if the image is unavailable.

To update, download a fresh `file-node.sh` with the command above and choose **Update**. It pulls the latest code (local edits to tracked files are stashed, never lost), then:

- **Docker installs** stop a leftover direct (systemd) service if there is one, pull the newest image and restart the containers. If the host port is still being released by the old container, starting is retried automatically.
- **Direct installs** reinstall dependencies, rebuild the app and restart the systemd service.

Useful installer overrides:

```bash
INSTALL_DIR=/opt/file-node HOST_PORT=8080 DOCKER_IMAGE=tonyliuzj/file-node:latest bash file-node.sh
```

### Docker Compose

If Docker is already installed, you can run the app directly with Compose. The image is published to Docker Hub for `linux/amd64` and `linux/arm64`.

```bash
cp example.env.local .env.local
mkdir -p data
cat > .env <<EOF
HOST_PORT=3000
CONTAINER_PORT=3000
DOCKER_IMAGE=tonyliuzj/file-node:latest
EOF
docker compose pull
docker compose up -d --no-build
```

`example.env.local` is safe to copy as is. To require a token on the first-run setup page, uncomment `FILE_NODE_SETUP_TOKEN` in `.env.local` and set it to something random (`openssl rand -hex 16`).

To build the image yourself instead, run `docker compose build` before `docker compose up -d --no-build`. To update later, run `docker compose pull && docker compose up -d --no-build` again. The database lives in `./data`, which is kept across updates.

The container starts as root only to hand `./data` to its `node` user (uid 1000), then runs the app unprivileged. `docker compose ps` reports the app as `healthy` once it answers HTTP requests.

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
   or the SQLite path. A random secret for sessions and credential encryption
   is generated into `data/secret.key` on first start; set
   `FILE_NODE_SECRET_KEY` only to a random value of your own
   (`openssl rand -base64 32`). Turnstile keys are configured later from the
   admin settings screen.

   ```
   AUTH_TRUST_HOST=true
   DATABASE_URL=data/data.db
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
├── .github/workflows/       # CI, Docker Hub publish, installer release
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh     # fixes data/ ownership, then drops root
├── file-node.sh             # interactive installer (systemd or Docker)
├── scripts/
│   └── reset-admin.mjs      # admin password recovery
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
| `FILE_NODE_SECRET_KEY` | Optional random secret for signing sessions and encrypting backend credentials. Generated into `data/secret.key` when unset. The old public example value is refused |
| `FILE_NODE_SETUP_TOKEN` | Optional. When set, the first-run `/setup` page also asks for this token (the installer generates one) |
| `FILE_NODE_DISABLE_TURNSTILE` | Recovery only. Set to `1` to switch every Turnstile check off if a wrong key locked you out of sign-in |
| `AUTH_TRUST_HOST` | Set to `true` behind a reverse proxy or custom domain |
| `DATABASE_URL` | SQLite database path. Defaults to `data/data.db`; Docker uses `/app/data/data.db` |
| `PORT` | Optional port for local/systemd startup |
| `HOST_PORT` | Docker Compose host port, used by `.env` |
| `CONTAINER_PORT` | Docker Compose container port, used by `.env` |
| `DOCKER_IMAGE` | Docker image to run. Defaults to `tonyliuzj/file-node:latest` |

### Initial Setup

On first run, or whenever the database has no users, open `/setup` to create
the first local admin account. The setup API is disabled automatically after the
first user exists. Passwords must be 8 to 72 bytes and are stored with bcrypt. If
`FILE_NODE_SETUP_TOKEN` is set (the installer sets it and prints it), the setup
page asks for it, so nobody who finds the server before you can claim the admin
account.

### Recovering access

Forgot the admin password? Reset it from the command line. This also signs out
every existing session.

```bash
# Docker
docker compose exec -u node file-node node scripts/reset-admin.mjs

# Direct install (from the app directory)
node scripts/reset-admin.mjs
```

It prompts for the new password, or reads `FILE_NODE_NEW_PASSWORD`. Use
`--username NAME` to pick the account if there is more than one.

Locked out because of a wrong Turnstile key? Add `FILE_NODE_DISABLE_TURNSTILE=1`
to your environment file, restart, sign in, fix the keys in `/admin/settings`
(the secret key is checked with Cloudflare before protection is enabled), then
remove the variable and restart.

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
  Admin-only: start a rescan of a specific backend in the background (responds `202`). Poll `GET /api/backends` for `scanning` and `scanError`.
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

## CI and Releases

GitHub Actions in `.github/workflows/`:

| Workflow | Runs on | What it does |
| -------- | ------- | ------------ |
| `ci.yml` | Pull requests and non-`main` pushes | Lint, typecheck and production build |
| `docker.yml` | Push to `main`, manual dispatch | Lint and typecheck, then build the `linux/amd64` + `linux/arm64` image and push `tonyliuzj/file-node:latest` and `tonyliuzj/file-node:<commit sha>` to Docker Hub |
| `release.yml` | Push to `main` that changes `file-node.sh` | Replaces `file-node.sh` on the `latest` GitHub release, which the install command downloads |

`docker.yml` needs two repository secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (a Docker Hub access token with read and write access).

## Security

* Backend passwords are encrypted at rest with `FILE_NODE_SECRET_KEY` or a generated persistent secret in `data/secret.key`. Existing `LIBRIX_SECRET_KEY` and `NEXTAUTH_SECRET` deployments remain supported as fallbacks. The example value that older copies of `example.env.local` shipped is public, so it is ignored (with a warning) and anything encrypted under it is re-encrypted automatically.
* Turnstile secret keys are encrypted before being stored in the SQLite settings table.
* Guests cannot access admin APIs or backend credentials.
* Admin panel and mutating routes require NextAuth credentials. Sessions last 7 days and end when the password changes.
* Optional Turnstile checks can protect browse, search, and admin sign-in.
* Repeated failed sign-ins are throttled, and sign-in takes the same time whether or not the username exists.
* Backend URLs may not carry a username or password; use the encrypted credential fields.
* File proxy requests are checked against the indexed backend root, send `X-Content-Type-Options: nosniff` and `Cross-Origin-Resource-Policy: same-origin`, and SVG/XML files are served sandboxed (`Content-Security-Policy: sandbox`) so script inside them cannot act as the signed-in admin.
* The PDF viewer runs with PDF.js `isEvalSupported: false`, the documented mitigation for CVE-2024-4367. `npm audit` still lists `pdfjs-dist` because the viewer library cannot move to PDF.js 4.x yet.
* Pages send `X-Frame-Options: SAMEORIGIN`, so the admin panel cannot be framed by another site.
* The data directory is private to the app user (`chmod 700`, files `600`); it holds password hashes and encrypted credentials.

### Known limitations

* Turnstile gates the browse and search APIs. The file stream itself (`/api/files/view`) is not gated, because `<img>`, `<video>` and `<audio>` elements cannot send the clearance header.
* A Turnstile clearance is not bound to one client, so anyone who obtains a valid one can reuse it until it expires.
* Modified times in directory listings carry no time zone and are taken as UTC. They are exact only when the backend server runs in UTC.
* Login throttling is held in memory: a restart resets it, and with no reverse proxy the client address header can be spoofed (the per-account limit still applies).
* The per-account limit means someone who knows the admin username can keep the admin from signing in for up to 15 minutes at a time by guessing wrongly. Waiting, or restarting the server, clears it.
* A folder is listed in one response with no pagination, so a single folder with tens of thousands of entries is slow to open.
* Public endpoints (search, listing, file streaming) have no per-client rate limit of their own; put a reverse proxy in front if the instance is exposed to the internet.

---
