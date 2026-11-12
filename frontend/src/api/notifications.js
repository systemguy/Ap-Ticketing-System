// In-app notifications: backend/app/controllers/notificationControllers.js
import { apiFetch } from './client';

// { notifications: [{ _id, type, title, message, ticket, ticketRef, service, severity, action, read, createdAt, email }], unread }
export const listNotifications = (limit = 50) => apiFetch(`/notifications?limit=${limit}`);

export const unreadCount = () => apiFetch('/notifications/unread-count').then((d) => d?.unread ?? 0);

export const markRead = (id) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });

export const markAllRead = () => apiFetch('/notifications/read-all', { method: 'PATCH' });

// Other parts of the page (e.g. the bell) listen for this to refresh right away
export const NOTIFICATIONS_CHANGED = 'notifications-changed';
export const announceChange = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
