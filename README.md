# AP Ticketing System

**Course:** COSC-3339-01, Software Engineering — St. Edward's University

**Team:** Adriana Teruel, Dayan Kijege, Paulo Avila, Madison Marfuggi

**Tech stack:** React (Vite) · Node.js / Express · MongoDB

## About Us

**AP Ticketing System** is a maintenance and incident management platform built for a
residential apartment community. We give residents a single point of contact to report
issues with their unit or the building, and give our maintenance and management staff a
way to track, prioritize, and resolve those issues efficiently.

We offer support across the building's core services,  plumbing, electrical, HVAC,
appliances, pest control, and common-area maintenance (lobbies, elevators, parking,
laundry rooms).

An **incident** is any reported issue affecting a resident's unit or a shared building
service — for example, a leaking faucet, a broken AC unit, or a malfunctioning elevator.
Each incident is logged by the resident who reports it, assigned to the team responsible
for that service, and tracked through to resolution. If an incident isn't addressed
within an expected time frame (e.g., a heating outage in winter), it is automatically
escalated to building management for priority handling.

## Technical Choices
Database: MongoDB — a NoSQL document database chosen for its flexible schema, which makes it easy to adapt as ticket structures and fields evolve, and for its strong integration with Node.js/Express applications.
Frontend: React with Node.js — chosen for its flexibility, strong industry adoption, and component-driven design that speeds up UI development.
Backend: Node.js — enables a unified JavaScript codebase across frontend and backend, with a large ecosystem of libraries and strong support for building scalable, API-driven applications.

## Branching Strategy

- main: stable, submission-ready code. Contains the merged `frontend/` and `backend/` apps.
- frontend/backend: component branches where each side of the app was built independently.
- Front-back_Integration: where the frontend was wired up to the live backend (API URLs, auth tokens, ticket endpoints) before merging into `main`.
- Feature branches (e.g., `password_strength_verification`):  used for individual features or fixes, merged back into their component branch when done.

Work happens on these branches (or short-lived branches cut from them for individual tasks), with regular commits reflecting incremental progress. No branch is merged into ‘main’ until all team members have reviewed and agreed on the change. ‘Main’ always reflects a working, demo-ready state of the project. 

Droplet deployment and server administration are managed exclusively by Dayan K. to avoid environment drift between team members’ changes. 

Each user can only see and edit or delete their own tickets, but cannot see/edit or delete anyone else’s unless they are part of the team associated with resolving that ticket

## Sprint 3 – Frontend update (`frontend` branch)

The `frontend` branch was brought up to date with `main` (it was still at Sprint 1) and
then updated with the Sprint 2 feedback fixes and the frontend items the group agreed on.
Full details, file by file, are in [`frontend/README.md`](frontend/README.md#sprint-3-frontend-update-for-the-group).

**Sprint 2 feedback addressed**
- Resolve, Close and Reopen now ask for confirmation; Reopen also requires a reason, which is saved on the timeline.
- Edit/Delete only show on tickets you filed, and Update status only on your team's tickets, so no one sees buttons they can't use.
- Incidents appear once on the profile (Active or Resolved & closed), and the closed column shows the date it's sorted by.
- Fixed closed tickets still showing in the active incidents list.

**Group items added**
- Home page: *Create a Ticket* and *View My Incidents* buttons.
- Residents no longer see the Active Incidents page (now *Team Queue*, staff only); they file tickets from a new *Report an Issue* page and track them on their profile.
- Profile picture button in the navbar; optional profile picture at registration.
- Optional photo on new tickets, shown on the ticket timeline.
- Dropdowns restyled and fixed; whole site restyled to one consistent look and made mobile-friendly.
- Admin pages (admins only): shift scheduling with dropdowns, a weekly shift calendar, and an overview of on-call gaps.

**Backend follow-ups** (small, listed in the frontend README): save the ticket `photo` field and serve `uploads/` so profile pictures display.

## Sprint 3 – Schedule, reassignment and admin portal (`sprint3-schedule-reassign-admin`)

- **Shift schedule page** (`/schedule`): one tab per team, who's on call now, and a week calendar of real shifts. Team leads get a **+ New shift** button and can change or remove shifts; the backend's schedule checks show every problem (gaps, double-booking, one person on two teams).
- **Reassign button** on tickets for the team lead: hands an active ticket to whoever is on call now, and the timeline records when, who did it, and the previous and new responder.
- **Admin portal** (`/admin`): every team's lead (changeable), who's on call, unowned services, and all accounts with deactivate/reactivate.
- Make an admin with `node --env-file=.env scripts/make-admin.js someone@example.com` in `backend/`.

Details are in [`frontend/README.md`](frontend/README.md#sprint-3-schedule-reassignment-admin-portal-for-the-group).

## Sprint 4 – Escalation policy, notifications, uptime and speed (`sprint4-final`)

**Decision: Tier 1 is the first person a ticket is escalated *to*.** A new ticket is assigned to
whoever is on call for the service's team (Sprint 3 auto-assignment). If nobody acknowledges it, it moves
to level 1, then level 2, and so on. After the last level comes the **final step**: the ticket is
unassigned, flagged (`escalationExhaustedAt`), pinned in red to the top of the team queue for every
solver on the team, and the team lead and every admin (facility administration) are notified.

The professor's HVAC example in our system: filed → on-call solver; level 1 Bob after 5 min; level 2
team lead Amy 5 min later; final step 10 min later.

- **Policy** (`/escalation/:team`, team lead or admin edits): up to 5 levels, each pointing to a role
  (*on call*, *team lead*) or a specific person on that team (or an admin), with minutes per severity,
  plus the final step's minutes. Validation rejects an empty policy, zero, negative or fractional minutes,
  unknown or deactivated users, people from another team, and time frames where a more severe ticket waits
  longer (Critical must be strictly faster than Low).
- **Copy policy:** a lead of several teams can copy one team's policy into another's form. Role levels
  carry over as roles, and specific people who aren't on the target team are left out and listed.
- **Timer:** server-side, every 30 seconds (`ESCALATION_INTERVAL_MS`), so it works with every browser closed.
  Only Open tickets escalate. A note doesn't stop it; acknowledging does. Reopening restarts at level 1.
  After downtime, it jumps straight to the right level, records the skipped levels on the timeline,
  and notifies only the person who has the ticket now. Saving or re-enabling a policy counts older
  tickets from that moment (`enabledAt`).
- **Notifications** (`helpers/notify.js`): in-app (bell in the navbar, `/notifications`) **and** email
  (nodemailer, SMTP settings in `.env`):
  - **Solvers**, whenever a ticket is assigned to them: on call when it's filed, reassigned by the lead,
    or escalated. Each notification has the incident id, service, severity and the action needed.
  - **Reporters**, only when their ticket is acknowledged and when it's resolved.
- **Requirement change: uptime and speed** (`/performance`, admins and team leads):
  - `GET /health`, with no login needed.
  - A heartbeat every 30 seconds; minutes without one count as downtime. Uptime is compared against a 99% target.
  - Server-side and in-browser timing (p50/p95, compared against targets) of log in, incident
    submission, incident resolution and the analytics refresh.
  - Time to acknowledge and time to resolve, by severity.
- **Sprint 3 fixes:** auto-assign on create; `/register/team` and `/register/services` are admin-only;
  deactivated accounts lose access immediately; the ticket photo is saved; `resolved` is kept up to date;
  `/uploads` is served; moving an Open ticket to another team's service re-routes it to that team.

`.env` for the backend: `MONGODB_URI`, `JWT_SECRET`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, optional `ESCALATION_INTERVAL_MS`. Without SMTP
settings, notifications still appear in the app and each email is marked "skipped".
