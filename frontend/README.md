# AP Ticketing System – Frontend

React (Vite) app for residents, maintenance staff and admins.

## How to run

```
npm install
npm run dev
```

Then open http://localhost:5173

## Connecting to the backend

The backend URL is `API_BASE` in `src/api/client.js` and defaults to the droplet.
To use another backend, create `.env.local` with:

```
VITE_API_URL=http://localhost:3000
```

## Pages and who can see them

| Route | Page | Who |
| --- | --- | --- |
| `/` | Home | Everyone |
| `/services` | Departments and the services they handle | Everyone |
| `/login` | Login / Register (with optional profile picture) | Everyone |
| `/profile` | Profile, bio, my active and resolved/closed incidents | Logged in |
| `/tickets/new` | Report an issue (with optional photo) | Logged in |
| `/incidents/:id/timeline` | One ticket: details, photo, status buttons, timeline, comments | Reporter + ticket's team |
| `/incidents` | Team Queue: open tickets for my teams (home team + teams I lead) + ones I filed | Staff and admins |
| `/schedule/:team` | On-call calendar for one team; team leads add, change and remove shifts | Staff and admins |
| `/admin` | Admin portal: teams, leads, who's on call, accounts | Admins |

"Staff" means the user's `team` in their login token is not `"user"`. A **team lead** is
anyone a Team document names as its `lead` (it comes back from `/users/me` as `leads`).
"Admin" means `role: "admin"` on their user document. Hiding pages is only a convenience; the backend
still decides what data each user can read or change.

## Expected endpoints

- `POST /login`, `POST /register` (register accepts multipart field `avatar`)
- `GET /users/me`, `PATCH /users/me`, `GET /users/me/tickets`
- `GET /tickets`, `POST /tickets/create`, `PUT /tickets/edit/:id`, `PUT /tickets/delete/:id`
- `GET /tickets/:id`, `PUT /tickets/update/:id`, `POST /tickets/:id/comments`
- `PUT /tickets/:id/assign` (team lead or admin; only to whoever is on call now)
- `GET /shifts`, `GET /shifts/on-call`, `POST /shifts`, `PATCH /shifts/:id`, `DELETE /shifts/:id`, `GET /teams`, `GET /users?role=staff`
- `GET /admin/overview`, `GET /admin/users`, `PATCH /admin/teams/:id/lead`, `PATCH /admin/users/:id/active`

## Project layout

```
src/
  api/          client.js (fetch wrapper), tickets.js, profile.js, schedule.js, admin.js
  components/   NavBar, TicketForm, ProtectedRoute, RoleRoute, Modal
  context/      SessionContext (who is logged in: id, team, role, photo, teams they lead)
  data/         services, severity, shifts (the 3 daily shifts + Central-time date helpers)
  pages/        Home, Auth, Services, Incidents (Team Queue), NewTicketPage,
                ProfilePage, IncidentTimelinePage, schedule/, admin/
  utils/        incidents.js (sorting, columns, dates), images.js (photo compression)
```

---

## Sprint 3 frontend update (for the group)

Everything below is frontend-only. Nothing in `backend/` was changed; the few backend
lines needed to finish two features are listed at the end.

### Sprint 2 feedback, addressed

1. **Status changes no longer happen in one accidental click** (Incident feedback).
   On the ticket timeline, *Mark resolved*, *Close ticket* and *Reopen* open a
   confirmation dialog with an "I understand" checkbox. **Reopen also requires a
   reason** (10+ characters), which is posted to the timeline as a staff note so
   everyone can see why the ticket came back. Reopen is styled as a secondary
   button, separate from the forward steps. *Acknowledge* and *Start investigating*
   stay one click. (`IncidentTimelinePage.jsx`)
2. **No more buttons that do nothing** (Role-based access feedback). On the Team
   Queue, *Edit* and *Delete* only appear on tickets you filed, and *Update status*
   only appears on your team's tickets. Each row is tagged *Filed by you*,
   *Your team*, or *Handled by another team*, and a filter switches between All /
   My team / Filed by me. When a solver opens a ticket they filed for another
   department, the timeline explains that the other team updates its status.
   (`Incidents.jsx`, `IncidentTimelinePage.jsx`)
3. **Incidents no longer appear twice on the profile** (Profile feedback). The
   "Filed by me" column is gone. Each incident is in exactly one column,
   *Active incidents* or *Resolved & closed*, with a *Filed by you* /
   *Assigned to you* tag. (`ProfilePage.jsx`, `utils/incidents.js`)
4. **Resolved/closed dates now match their order** (Profile feedback). That column
   is sorted by, and displays, the date the ticket was resolved or closed
   ("Finished Oct 8"). Active incidents show "Filed …". The date follows the
   current status, so a reopened-then-resolved ticket shows its latest date.
   (`utils/incidents.js` → `finishedAt`)
5. **Bug fix: closed tickets were still in the active list.** The list filtered on
   the old `resolved` boolean, which status changes never set. It now uses the
   ticket's `status`. (`Incidents.jsx`)

### Items from our group discussion

- **Home page buttons:** logged-in users see *Create a Ticket* and
  *View My Incidents* (→ profile). Staff also get a link to the Team Queue.
  Logged-out visitors see *Login / Register* and *See Our Services*.
- **Residents don't get the Active Incidents page.** It's renamed *Team Queue*,
  hidden from residents' navbar, and visiting `/incidents` as a resident redirects
  to the profile, where their active incidents are listed. Residents file tickets
  from the new **Report an Issue** page (`/tickets/new`), linked from the navbar,
  home, profile and Services page. After login, staff land on the Team Queue and
  residents on their profile.
- **Profile picture button:** the navbar shows the user's profile picture as a
  round button that opens their profile. Registration has an optional profile
  picture upload (sent as `avatar`, which the backend already accepts).
- **Incident picture:** *Report an Issue* has an optional photo with a preview.
  It's resized in the browser to a small JPEG (well under 100 KB) and sent with the
  ticket as `photo`. The timeline shows it, and clicking it opens it full size.
- **Dropdowns fixed:** selects used the browser's default gray box and didn't
  match the underlined text fields. They now share the same style with a custom
  arrow, Department/Service sit side by side, the severity placeholder is greyed
  out, and editing a ticket whose service is no longer in the list keeps it
  selectable. Service names display properly ("AC repair").
- **More aesthetic:** the profile and timeline pages were still on the unstyled
  blue Sprint 2 baseline; they now use the site's serif-and-gold look. All colors
  are CSS variables at the top of `index.css`. Added a sticky navbar with an
  active-page underline, a mobile menu, cards with soft shadows, a details panel
  on the ticket page, and a redesigned home page. Every page now works at phone
  width.
- **Admin pages:** replaced by the real on-call schedule and admin portal (see
  "Sprint 3: schedule, reassignment, admin portal" below).

### Shared code we added

- `context/SessionContext.jsx`: one place for who is logged in (`userId`, `team`,
  `isStaff`, `isAdmin`, `user`). Use `useSession()` instead of reading
  `localStorage` directly.
- `components/RoleRoute.jsx`: `<RoleRoute allow="queue" />` and
  `<RoleRoute allow="admin" />` route guards.
- `components/TicketForm.jsx`: the create/edit form, shared by Report an Issue and
  the Team Queue.
- `api/tickets.js`: all ticket requests now go through `apiFetch`.

### Backend follow-ups needed (not done on this branch)

1. **Save incident photos.** In `app/models/tickets.js` add
   `photo: { type: String, required: false }`, and in `POST /tickets/create` read
   `photo` from `req.body` and pass it to `Ticket.create`. Until then the photo is
   simply ignored and ticket creation still works.
2. **Show profile pictures.** Uploaded avatars are saved to `backend/uploads/` but
   the folder isn't served. In `app.js` add
   `app.use('/uploads', express.static(path.join(__dirname, 'uploads')))`.
   Until then everyone shows the default avatar.
3. ~~Make an admin~~ Done: `node --env-file=.env scripts/make-admin.js email`.
4. ~~Scheduling API~~ Done: the schedule page uses Dayan's `/shifts` routes.

---

## Sprint 3: schedule, reassignment, admin portal (for the group)

Branch `sprint3-schedule-reassign-admin`, cut from `main` after Dayan's team-names merge.
Everything runs on real data: the demo-data admin pages and `data/demoStaff.js` are gone.

### Shift schedule page (`/schedule`, link "Schedule" in the navbar)

- **One page per team** (`/schedule/HVAC`, `/schedule/Plumbing`, …) with tabs. You see your
  home team plus every team you lead; admins see all teams. Reporters and logged-out
  visitors can't open it (they're sent to their profile / the login page).
- **Who's on call now** banner at the top: the person and when their shift ends, or why
  nobody is (no schedule yet, schedule ended, a gap, deactivated account).
- **Week calendar:** Morning / Evening / Overnight × Mon–Sun, real shifts from the database.
  The current shift is highlighted green; past ones are faded; uncovered upcoming slots are
  hatched. Previous / next / this week buttons.
- **Team leads only** (and admins): a **+ New shift** button, plus **+ Add** in empty slots.
  Pick a date, the shift and who covers it (only that team's members and its lead are offered),
  one shift at a time.
  Click a name to change who covers that shift or remove it. The backend checks everything
  before saving and every problem shows in the dialog, e.g. "HVAC is missing coverage from
  Friday, Oct 30, 7:00 AM to Sunday, Nov 1, 7:00 AM". Removing a shift that would leave a gap
  is refused the same way.

### Reassign button on tickets (team leads)

On a ticket's page, the lead of that ticket's team sees an **Assignment** panel: who has the
ticket, who's on call for the team right now, and a **Reassign to <name>** button. Per the
spec, a ticket can only go to the person on call now, so the button names them and is greyed
out (with the reason) when that person already has it or nobody is on call. It asks for
confirmation, keeps the status as it is, and the timeline records the time, who made the
change, and the previous and new responder ("Morgan Lee reassigned this from Tim Walker to
Morgan Lee").

Team leads now also see and can work every ticket for the teams they lead, not just their home
team (Morgan's home team is HVAC but he leads Plumbing and Electrical too). The Team Queue tags
each ticket with its team and shows who it's assigned to.

### Admin portal (`/admin`, admins only)

- **Stats:** active tickets, unassigned tickets, teams with nobody on call, active responders.
- **Teams:** each team's lead (change it from a dropdown), who's on call now and until when,
  how far ahead it's scheduled, and its services. Services with no owning team are listed.
- **Accounts:** search and filter everyone; **Deactivate / Reactivate** (soft delete) with a
  confirmation. A deactivated person can't log in and is never treated as on call. You can't
  deactivate yourself or someone who still leads a team.

### Backend changes on this branch (Dayan, please review)

- `PUT /tickets/:id/assign`: team lead of the ticket's team or an admin; only to the person
  on call now; refuses resolved/closed tickets, unowned services and teams with nobody on call
  with a clear message; records an `assignment_change` event.
- `GET /tickets/:id` also returns `assignment` (who's on call, whether reassign is allowed and
  why not) for leads. `GET /tickets`, status changes and notes now include teams you lead.
- New `adminControllers.js` (`/admin/...`, role `admin` only). Login refuses deactivated
  accounts.
- `scripts/make-admin.js`: `node --env-file=.env scripts/make-admin.js someone@example.com`

### Not on this branch

Auto-assignment on ticket creation is Paulo's piece; his last push to `auto-assignment` only
contained a Windows shortcut file, so the real `ticketControllers.js` still needs committing.
