# Request: Entra ID app registration — "BBD Project Planner"

**Requested by:** Streicher Stegmann
**Date:** 2026-08-06
**What we need back:** the registration's **Application (client) ID** and **Directory (tenant) ID**. Nothing else — no secrets, no certificates.

## What the app is

A browser-based roadmap/Gantt planning tool used by BBD staff for project and delivery planning. It is a **static single-page application** (React) hosted on Cloudflare — there is **no backend server and no database**; today all data lives in local files. We want users to sign in with their Microsoft 365 accounts so plans can be stored in the team's own SharePoint/Teams files instead of loose local copies, with access controlled by existing Team membership.

- Current URL: `https://ganttplanner.atrum-core.workers.dev`
- All Microsoft data stays inside the tenant (SharePoint/OneDrive). The app talks directly from the user's browser to Microsoft Graph. We never store, proxy, or host any tenant data ourselves.

## Registration details requested

| Setting | Value |
|---|---|
| Name | BBD Project Planner |
| Supported account types | Single tenant (this organisational directory only) |
| Platform | **Single-page application (SPA)** |
| Redirect URIs | `https://ganttplanner.atrum-core.workers.dev` and `http://localhost:5173` (development) |
| Client secret / certificate | **None** — SPA uses authorization code flow with PKCE |
| Implicit grant | Disabled (not needed) |

A custom-domain redirect URI may be requested as a follow-up later (routine addition).

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

## Contact

Questions / demo: Streicher Stegmann — streicher.stegmann@gmail.com (or Teams).
