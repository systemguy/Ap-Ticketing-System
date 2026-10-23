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
