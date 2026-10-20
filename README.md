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

**Multi-branch firms** (chosen by the super admin per firm)
- Firm admin creates branches; each branch gets a kiosk login (`<firmcode>-<name>`) that shows only company info, a QR that changes daily, and that day's check-in / check-out list
- Admin assigns employees to branches and creates employee logins (`<firmcode>-<empcode>`)
- Employees scan their own branch's QR (phone camera or in-app scanner): first scan checks in (late detection), second checks out (short day → half day)
- Employees see their attendance history and finalized payslips (view / PDF)
- The QR is an HMAC of branch + date signed with a per-branch secret, verified server-side in `scan_attendance`

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
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `.env.example`)

`wrangler.toml` serves `dist/` with single-page-app fallback. CLI alternative: `npx wrangler login && npm run deploy`.

Add the deployed URL to Supabase → Authentication → URL Configuration (Site URL / redirect URLs).
