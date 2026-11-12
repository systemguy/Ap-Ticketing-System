// Notifications (the bell)
import { apiFetch } from './client';

// Returns { notifications, unread }
export const listNotifications = (limit = 50) => apiFetch(`/notifications?limit=${limit}`);

export const unreadCount = () => apiFetch('/notifications/unread-count').then((d) => d?.unread ?? 0);

export const markRead = (id) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });

export const markAllRead = () => apiFetch('/notifications/read-all', { method: 'PATCH' });

// Lets the bell update right away after something is marked read
export const NOTIFICATIONS_CHANGED = 'notifications-changed';
export const announceChange = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
