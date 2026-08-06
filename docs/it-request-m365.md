# Request: host "BBD Project Planner" on BBD infrastructure + Entra ID app registration

**Requested by:** Streicher Stegmann
**Date:** 2026-08-06

Two related asks for the same internal tool:

1. **Hosting** — move the app into BBD's Cloudflare account and give it a BBD subdomain.
2. **Entra ID app registration** — so staff can sign in with their Microsoft 365 accounts and keep plans in their own Team's files.

Neither is a hard blocker for the other, but doing both makes this a properly BBD-owned internal tool rather than something running on personal infrastructure.

## What the app is

A browser-based roadmap/Gantt planning tool for project and delivery planning — swimlanes, phase bars, environments, and people allocation with clash detection. It is a **static single-page application** (React): **no backend server, no database, no data at rest anywhere we control**. Today each user keeps plans as local `.json` files, which makes sharing awkward and versions drift.

The goal is that a user signs in with their BBD account and a plan lives in the relevant **Team's own SharePoint/Teams files**, so access is governed by existing Team membership rather than by emailing files around.

- Current URL: `https://ganttplanner.atrum-core.workers.dev`
- All Microsoft data stays inside the tenant (SharePoint/OneDrive). The browser talks directly to Microsoft Graph; we never store, proxy, or host tenant data.

## Ask 1 — Hosting on BBD infrastructure

The app is currently deployed to a **personal Cloudflare account** (`atrum-core`). Since it is intended for BBD staff, it should live on BBD infrastructure.

Both `bbdsoftware.com` and `bbd.co.za` are already served through Cloudflare, so this should be straightforward:

| What we need | Notes |
|---|---|
| The app deployed as a Worker in **BBD's Cloudflare account** | Static assets only — no server-side code, no bindings, no databases, no secrets |
| A subdomain of your choosing | e.g. `projectplanner.bbdsoftware.com`, or whatever fits your convention for internal tools |
| A **scoped API token** for deployments (optional but preferred) | Limited to this one Worker, so releases don't need dashboard access. Alternatively IT runs the deploy and we hand over the built files |

The deployment is a static build — `npm run build` produces a `dist/` folder of HTML/CSS/JS that Cloudflare serves. Nothing executes server-side.

**Note:** a Cloudflare Worker's custom domain must be in the same Cloudflare account as the Worker. That is the only reason this is an infrastructure request rather than a DNS record — a CNAME from BBD's zone to the personal account would fail TLS.

## Ask 2 — Entra ID app registration

| Setting | Value |
|---|---|
| Name | BBD Project Planner |
| Supported account types | Single tenant (this organisational directory only) |
| Platform | **Single-page application (SPA)** |
| Redirect URIs | The BBD subdomain from Ask 1 (e.g. `https://projectplanner.bbdsoftware.com`) and `http://localhost:5173` (development) |
| Client secret / certificate | **None** — SPA uses authorization code flow with PKCE |
| Implicit grant | Disabled (not needed) |

**What we need back:** the **Application (client) ID** and **Directory (tenant) ID**. Nothing else — no secrets, no certificates.

If Ask 1 takes longer, we can start with `https://ganttplanner.atrum-core.workers.dev` as the redirect URI and add the BBD one later — adding a redirect URI to an existing registration is a routine change.

## Permissions requested — delegated only, with tenant-wide admin consent

No application permissions are requested. Every permission below is **delegated**: the app can only ever act as the signed-in user, on resources that user can already access today. It grants nobody any new access.

| Delegated scope | Why the app needs it | Admin consent needed |
|---|---|---|
| `User.Read` (+ `openid`, `profile`) | Sign-in; show the user's own name/photo | No |
| `Team.ReadBasic.All` | List the Teams the user belongs to (to pick where a plan lives) | No |
| `TeamMember.Read.All` | Show a Team's member list as suggestions when allocating work in a plan | **Yes** |
| `User.ReadBasic.All` | Display colleagues' names/profile photos in those suggestions | No |
| `Files.ReadWrite.All` | Open/save plan JSON files in the Team's document library, and in the user's own OneDrive (drafts) | Tenant policy dependent |

We ask for tenant-wide admin consent for all five so individual users are not prompted.

**On `Files.ReadWrite.All`:** although broad by name, the *delegated* version is bounded by each user's existing SharePoint permissions — a user can only reach libraries they are already a member of. The app writes only its own plan files (a `Roadmaps` folder it creates in a Team's General channel files, and an app folder in the user's OneDrive).

**Narrower alternative (plan B), if preferred:** `Sites.Selected` with per-site grants to the specific Team site(s) that hold roadmaps, plus `Files.ReadWrite` (user's own OneDrive only). Trade-off: every new Team that wants to use the tool then requires an admin to grant the app access to that site — we'd need an agreed process for those grants. We can also drop `User.ReadBasic.All` (photos degrade to initials).

## Security posture

- **No secrets exist anywhere** — the SPA uses PKCE; the client ID is a public identifier.
- **Tokens** are held in browser `sessionStorage` only (cleared when the tab session ends); nothing is persisted server-side because there is no server.
- **Conditional access / MFA** apply unchanged — sign-in is a standard Entra redirect flow.
- **Auditability** — all activity appears in Entra sign-in logs and standard SharePoint/Graph audit trails under the user's own identity.
- Data never leaves the tenant: the app is static JavaScript; its only network calls are to `login.microsoftonline.com` and `graph.microsoft.com` (enforced via Content-Security-Policy).
- **Approving Ask 1 strengthens this position** — BBD then controls the hosting, the domain, and the certificate for the origin the app registration trusts, instead of that origin sitting on a personal account.

## If you'd rather not do one of these

- **Hosting but not the app registration:** the tool still works — plans stay as local/shared files. Sign-in simply stays switched off.
- **App registration but not the hosting:** also fine — we register `https://ganttplanner.atrum-core.workers.dev` as the redirect URI instead, and revisit hosting later.
- **Neither, for now:** we would appreciate knowing which part is the concern, so the design can be adjusted rather than shelved.

## Contact

Questions, or a live walkthrough of the app: Streicher Stegmann — streicher@bbd.co.za (or Teams).
