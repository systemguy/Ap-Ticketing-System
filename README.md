# AP Ticketing System

A full-stack incident and maintenance management platform built for a residential apartment community, giving residents a single point of contact to report issues and giving maintenance staff a way to track, prioritize, and resolve them, with automatic escalation for overdue tickets.

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
