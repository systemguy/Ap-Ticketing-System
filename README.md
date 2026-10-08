# AP Ticketing System - Frontend

React app for Sprint 1: Home, Login/Register, and Active Incidents pages.

## How to run

npm install
npm run dev

Then open http://localhost:5173

## Connecting to the backend

The backend URL is `API_BASE` in `src/api/client.js` and defaults to the droplet.
To use another backend, create `.env.local` with:

VITE_API_URL=http://localhost:3000

Expected endpoints:

- POST /login
- POST /register
- GET /tickets
- PUT /tickets/edit/:id
- PUT /tickets/delete/:id
- POST /tickets/create
