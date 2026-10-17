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
| `/incidents` | Team Queue: open tickets for my team + ones I filed | Staff and admins |
| `/admin` | Admin overview | Admins |
| `/admin/schedule` | Assign staff to shifts with dropdowns | Admins |
| `/admin/calendar` | Week calendar of everyone's shifts | Admins |

"Staff" means the user's `team` in their login token is not `"user"`. "Admin" means
`role: "admin"` on their user document. Hiding pages is only a convenience; the backend
still decides what data each user can read or change.

## Expected endpoints

- `POST /login`, `POST /register` (register accepts multipart field `avatar`)
- `GET /users/me`, `PATCH /users/me`, `GET /users/me/tickets`
- `GET /tickets`, `POST /tickets/create`, `PUT /tickets/edit/:id`, `PUT /tickets/delete/:id`
- `GET /tickets/:id`, `PUT /tickets/update/:id`, `POST /tickets/:id/comments`

## Project layout

```
src/
  api/          client.js (fetch wrapper), tickets.js, profile.js, schedule.js
  components/   NavBar, TicketForm, ProtectedRoute, RoleRoute
  context/      SessionContext (who is logged in: id, team, role, photo)
  data/         services, severity, shifts, demoStaff (placeholder roster)
  pages/        Home, Auth, Services, Incidents (Team Queue), NewTicketPage,
                ProfilePage, IncidentTimelinePage, admin/
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
- **Admin pages** (visible only to users with `role: "admin"`):
  - **Scheduling:** dropdowns for Department → Employee, Shift (Morning, Evening,
    Overnight, On-call), a date, and Repeat (just this day / every weekday that
    week / same day for 4 weeks). Duplicate shifts are skipped, and upcoming shifts
    can be filtered and removed.
  - **Shift calendar:** a week grid (shifts × days) showing who is working,
    colored by department, with previous/next week and a department filter. A day
    with no on-call person for the chosen department is flagged.
  - **Overview:** shifts this week, staff scheduled, and on-call gaps.

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
3. **Make an admin.** There's no admin signup (on purpose). Set it in Mongo:
   `db.users.updateOne({ email: "..." }, { $set: { role: "admin" } })`.
4. **Scheduling API (Sprint 3).** The admin pages currently save shifts in the
   browser's localStorage and use a sample staff list (`data/demoStaff.js`). The
   expected endpoints are documented at the top of `src/api/schedule.js`; once they
   exist, only that file needs to change.
