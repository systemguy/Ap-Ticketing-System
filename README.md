# AP Ticketing System - Frontend

React app for Sprint 1: Home, Login/Register, and Active Incidents pages.

## How to run

npm install
npm run dev

Then open http://localhost:5173

## Connecting to the backend

The API URL is set at the top of `src/pages/Auth.jsx` and `src/pages/Incidents.jsx`:

const API_URL = 'http://localhost:4000';

Change that to wherever the backend is running. Expected endpoints:

- POST /auth/login
- POST /auth/register
- GET /incidents
