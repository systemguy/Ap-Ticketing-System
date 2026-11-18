import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import { departmentServices as BUILT_IN } from './services';

// The services people can file incidents against, grouped by the team that handles them:
// { HVAC: ['ac repair'], ... }. Comes from GET /services, so a service or team an admin deleted
// disappears from the form and the Services page. Services no team owns are left out (nobody
// could be assigned to them). Until the list loads, or if it can't be loaded, the built-in list
// in data/services.js is used.
let cached = null;
let pending = null;

function group(list) {
  const byTeam = {};
  for (const { name, team } of list) {
    if (team) (byTeam[team] ||= []).push(name);
  }
  return byTeam;
}

function load() {
  pending ||= apiFetch('/services')
    .then((d) => {
      cached = group(d?.services || []);
      return cached;
    })
    .catch(() => BUILT_IN)
    .finally(() => { pending = null; });
  return pending;
}

export function useServices() {
  const [byTeam, setByTeam] = useState(cached || BUILT_IN);
  const [loaded, setLoaded] = useState(Boolean(cached));
  useEffect(() => {
    let alive = true;
    load().then((data) => {
      if (alive) {
        setByTeam(data);
        setLoaded(true);
      }
    });
    return () => { alive = false; };
  }, []);
  return { byTeam, teams: Object.keys(byTeam), loaded };
}

// The team that handles a service, e.g. "pipe repairs" -> "Plumbing" (null if unknown)
export const teamOf = (byTeam, service) =>
  Object.keys(byTeam).find((t) => byTeam[t].includes(service)) || null;
