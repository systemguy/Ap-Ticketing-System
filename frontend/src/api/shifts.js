import { apiFetch } from './client';

export const listShifts = () =>{
    apiFetch('/shifts').then((data) => ((Array.isArray(data) ? data : data?.tickets || []))(Array.isArray(data) ? data : data?.shifts || []))
}

export const createShiftst = (payload) =>
  apiFetch('/shifts', { method: 'POST', body: JSON.stringify(payload) }).then((data) => data?.shifts);