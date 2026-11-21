# Sprint 5 checkpoint: soft deletion and the auditor role

Backend for the Sprint 5 checkpoint, plus the admin portal controls for deleting and restoring.
The auditor screens are still to be built (see "For the auditor UI" below).

## Our deletion rule

When something can't be deleted without breaking a rule from an earlier sprint, **the delete is
refused until an admin or lead fixes it by hand.** The refusal lists every problem in plain
words, so the admin knows exactly what to move first. We use the same rule everywhere:

| Deleting... | Refused while... |
|---|---|
| A person | they have current or future on-call shifts (as primary or secondary), they lead a team, they are named in an escalation level, or they have open incidents assigned |
| A service | it has open incidents (Open, Acknowledged or Investigating) |
| A team | it owns services, has members, or has current or future shifts |

Moving a person to another team uses the same check, limited to the team they're leaving. Moving
a service to another team is refused while it has open incidents.

## How the schema changed

The users, teams, services and tickets collections all get the same four fields, from one shared
Mongoose plugin (`backend/app/helpers/softDelete.js`):

| Field | Meaning |
|---|---|
| `active` | `false` once deleted. Users already had it; documents saved before it existed count as active. |
| `deletedAt` | when it was deleted |
| `deletedBy` | who deleted it (a user id) |
| `deletionLog` | every delete and restore (`action`, `by`, `at`), so restoring doesn't erase the record |

Ticket timelines also get a new event type, `deleted`, written when a reporter deletes their
incident. Nothing is ever removed from the database.

## How deleted items are handled

- **Accounts:**
  - a deleted account can't log in (403);
  - its email can't register again ("User already exists");
  - it's never on call;
  - it's left out of every staff, lead and escalation picker.
- **Services:** a deleted service disappears from `GET /services` (which now feeds the incident
  form and the Services page instead of a hard-coded list), and filing against it is refused.
- **Teams:** a deleted team disappears from `GET /teams`, the schedule and escalation pages.
  Escalation skips it, and its name can't be reused (restore it instead).
- **Incidents:**
  - a deleted incident leaves every list and can't be worked by anyone;
  - it no longer counts toward an on-call person's 3-incident limit, and escalation skips it.
- **History stays:**
  - old incidents keep their service and assignee, and still count for their team (filtering by a
    deleted team still finds them);
  - names of deleted people still show on timelines;
  - auditors see deleted incidents, marked as deleted;
  - a person moved to another team keeps their past resolved work, but only works their new
    team's incidents.

## Admin API (all need an admin login)

| Request | What it does |
|---|---|
| `PATCH /admin/users/:id/active` `{active}` | delete or restore an account |
| `PATCH /admin/users/:id/team` `{team}` | move to a team, or `null` for no team |
| `PATCH /admin/users/:id/role` `{role}` | `admin`, `auditor` or `standard` |
| `POST /admin/teams` `{name}` | create a team |
| `DELETE /admin/teams/:id` | delete a team |
| `POST /admin/teams/:id/restore` | restore a team |
| `GET /admin/services` | every service, including deleted ones |
| `POST /admin/services` `{name, team}` | create a service |
| `PATCH /admin/services/:id` `{team}` | give a service to another team |
| `DELETE /admin/services/:id` | delete a service |
| `POST /admin/services/:id/restore` | restore a service |

A refused delete returns **409**, with `error` (one sentence) and `problems` (every reason).

To make an auditor from the command line:

```bash
node --env-file=.env scripts/make-admin.js someone@example.com --auditor
```

## For the auditor UI

Auditors can read every incident (all teams, all time, deleted ones too) but can't change
anything. Following what was said in class, they can still report incidents of their own.

**`GET /tickets`** returns every incident for an auditor. Deleted ones have `active: false`.
Filters are optional query parameters, combined with AND:

| Parameter | Example | Meaning |
|---|---|---|
| `severity` | `3,4` | only these severities (1 Low to 4 Critical) |
| `team` | `HVAC,OIT` | only these teams' services |
| `excludeTeam` | `OIT` | everything except these teams |
| `service` | `ac repair` | only these services |
| `excludeService` | `network setup` | everything except these services |
| `from`, `to` | `2026-11-01` | filed on these days, both included, in Central time |

For the date presets, compute the dates in the browser:
- **Last week:** today minus 6 days to today.
- **This month:** the 1st to today.
- **This year:** Jan 1 to today.
- **Custom:** whatever is picked.
- **No dates:** everything (the default).

A bad value returns 400 with a readable `error`.

**`GET /tickets/:id`** gives an auditor the full ticket and timeline, with `role: "auditor"`,
`readOnly: true` and `nextStatuses: []`. The timeline page already hides the note box when
`readOnly` is true. Every write route (status, notes, reassign, edit, delete) returns 403 for
auditors.

**Still to do in the UI:**
- Let auditors reach the incident list. `RoleRoute` in `App.jsx` sends non-staff away from
  `/incidents` today.
- Add the filter and date-range controls.
- Hide the action buttons for auditors.

Use the role from `GET /users/me` (`role === "auditor"`).

## Testing

`e2e-checkpoint.mjs` (52 checks) runs every rule above against a local backend: each refusal
case, delete and restore with who and when, login and re-register blocked, pickers, history after
deletion, team moves, every filter, and the auditor being read-only. The Sprint 4 suites still pass
(47/47 and 24/24).
