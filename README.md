# Techyverve Payroll

Multi-tenant payroll SaaS. A **super admin** onboards firms; each firm gets **one HR login** with its own isolated workspace for attendance, deduction rules and monthly payslips.

**Stack:** React + Vite + Tailwind (frontend on Cloudflare Pages) · Supabase (Postgres, Auth, RLS, Edge Functions) · GitHub.

## Features

**Super admin**
- Platform overview: firms, headcount, today's attendance, latest payroll totals
- Create firms with full details (address, GSTIN/PAN/TAN, PF & ESI codes, contact, employee limit) plus the firm's HR login
- Edit firm, suspend/reactivate workspace, reset HR password, delete firm

**Firm HR**
- Dashboard: present/absent/leave/late today, 14-day trend, department split, absentees, payroll summary, upcoming holidays
- Attendance: daily marking (P / A / Half day / Paid leave / Unpaid leave), check-in/out with automatic late detection, OT hours, bulk mark; monthly register grid
- Employees: salary structure (Basic, HRA, Conveyance, Special, Other), bank & statutory IDs, PF/ESI applicability
- Settings (rules): weekly offs, shift & grace, late marks → half-day cut, paid-leave quota, unmarked-day policy, LOP basis (working / calendar / fixed 30), overtime, PF, ESI, PT, TDS, custom earnings & deductions, holiday calendar
- Payslip format: Classic / Modern / Compact templates, brand colour, toggles (logo, bank, attendance, amount in words), footer, live preview
- Payroll: run, review, recalculate, finalize/lock, preview, print or save PDF (one or all), bank-transfer CSV, history

## Setup

```bash
npm install
cp .env.example .env   # already points at the payroll-techyverve Supabase project
npm run dev
```

1. Open the app. On first run the login page shows **Set up your platform**: the first account created becomes the super admin. Later sign-ups get no access.
2. Confirm the email Supabase sends, then sign in and create firms from **Firms → New firm**.

### Database
Migrations live in `supabase/migrations/` and the `admin-firm` edge function in `supabase/functions/`. Both are already applied to project `aepgxlyakbdxymhypont`. For a new project:

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy admin-firm
```

## Deploy to Cloudflare (Workers static assets)

Cloudflare → Workers & Pages → Create → Import a repository, select this repo:
- Build command: - Deploy command: 
╭─────────────────────────────────╮
│ Did you mean "wrangler deploy"? │
╰─────────────────────────────────╯

wrangler

COMMANDS
  wrangler docs [search..]        📚 Open Wrangler's command documentation in your browser
  wrangler complete [shell]       ⌨️ Generate and handle shell completions

  wrangler email                  Manage Cloudflare Email services [open beta]

ACCOUNT
  wrangler auth                   🔐 Manage authentication
  wrangler login                  🔓 Login to Cloudflare
  wrangler logout                 🚪 Logout from Cloudflare
  wrangler whoami                 🕵️ Retrieve your user information

COMPUTE & AI
  wrangler agent-memory           🧠 Manage Agent Memory namespaces [private beta]
  wrangler ai                     🤖 Manage AI models
  wrangler ai-search              🔍 Manage AI Search instances [open beta]
  wrangler browser                🌐 Manage Browser Run sessions [open beta]
  wrangler containers             📦 Manage Containers
  wrangler delete [name]          🗑️ Delete a Worker from Cloudflare
  wrangler deploy [path]          🆙 Deploy a Worker to Cloudflare
  wrangler deployments            🚢 List and view the current and past deployments for your Worker
  wrangler dev [script]           👂 Start a local server for developing your Worker
  wrangler dispatch-namespace     🏗️ Manage dispatch namespaces
  wrangler flagship               🚩 Manage Flagship apps and feature flags [open beta]
  wrangler init [name]            📥 Initialize a basic Worker
  wrangler pages                  ⚡️ Configure Cloudflare Pages
  wrangler preview [script]       👀 Create a Preview deployment of the current Worker [open beta]
  wrangler queues                 📬 Manage Workers Queues
  wrangler rollback [version-id]  🔙 Rollback a deployment for a Worker
  wrangler secret                 🤫 Generate a secret that can be referenced in a Worker
  wrangler setup                  🪄 Setup a project to work on Cloudflare
  wrangler tail [worker]          🦚 Start a log tailing session for a Worker
  wrangler triggers               🎯 Updates the triggers of your current deployment [experimental]
  wrangler types [path]           📝 Generate types from your Worker configuration
  wrangler versions               🫧 List, view, upload and deploy Versions of your Worker to Cloudflare
  wrangler vpc                    🌐 Manage VPC [open beta]
  wrangler workflows              🔁 Manage Workflows

STORAGE & DATABASES
  wrangler artifacts              🧱 Manage Artifacts namespaces and repos [open beta]
  wrangler basin                  🏞️ Manage Basin products
  wrangler d1                     🗄️ Manage Workers D1 databases
  wrangler hyperdrive             🚀 Manage Hyperdrive databases
  wrangler k2                     ⛰️ Manage K2 streams [open beta]
  wrangler kv                     🗂️ Manage Workers KV Namespaces
  wrangler r2                     📦 Manage R2 buckets & objects
  wrangler secrets-store          🔐 Manage the Secrets Store [open beta]
  wrangler vectorize              🧮 Manage Vectorize indexes

NETWORKING & SECURITY
  wrangler cert                   🪪 Manage client mTLS certificates and CA certificate chains used for secured connections [open beta]
  wrangler mtls-certificate       🪪 Manage certificates used for mTLS connections
  wrangler tunnel                 🚇 Manage Cloudflare Tunnels [experimental]
  wrangler turnstile              🛡️ Manage Turnstile widgets [alpha]

GLOBAL FLAGS
  -c, --config          Path to Wrangler configuration file  [string]
      --cwd             Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
  -e, --env             Environment to use for operations, and for selecting .env and .dev.vars files  [string]
      --env-file        Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
  -h, --help            Show help  [boolean]
      --install-skills  Install Cloudflare skills for detected AI coding agents before running the command  [boolean] [default: false]
      --profile         Use a specific auth profile  [string]
  -v, --version         Show version number  [boolean]

Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
- Build variables: ,  (see )

 serves  with single-page-app fallback. CLI alternative:  ⛅️ wrangler 4.151.2
────────────────────
Attempting to login via OAuth...
Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=k2.read%20k2.write%20account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20agent-memory%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20challenge-widgets.write%20offline_access&state=O_n6jb~c2OhLr2HOwnvZdZMxP78E9CA9&code_challenge=qKJ08S2ruAKUsfsvTw95AG43APq5BoqpIP2s5l52q90&code_challenge_method=S256
Successfully logged in..

Add the deployed URL to Supabase → Authentication → URL Configuration (Site URL / redirect URLs).
