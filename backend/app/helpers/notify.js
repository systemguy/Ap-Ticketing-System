// Sends notifications. Each one is saved in the app (the bell) and also emailed.
//
// Who gets notified:
//   - a solver, when a ticket is assigned to them (on call, by the lead, or by escalation)
//   - the team lead and admins, when a ticket reaches the final escalation step
//   - the reporter, only when their ticket is acknowledged or resolved
//
// Email uses the SMTP_* settings in .env. If SMTP_HOST is empty, we skip the email
// but still save the in-app notification.
const nodemailer = require('nodemailer')
const Notification = require('../models/notification')
const User = require('../models/user')

const SEVERITY_LABELS = { 1: 'Low', 2: 'Moderate', 3: 'High', 4: 'Critical' }

let transporter = null
function mailer() {
	if (!process.env.SMTP_HOST) return null
	if (!transporter) {
		const auth = process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
		transporter = nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port: Number(process.env.SMTP_PORT || 587),
			secure: process.env.SMTP_SECURE === 'true',
			auth,
		})
	}
	return transporter
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Short ticket id, same as the one shown in the Team Queue
const ticketRef = (ticket) => `#${String(ticket._id).slice(-6).toUpperCase()}`
const serviceLabel = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase()).replace(/\bac\b/gi, 'AC')
const severityText = (n) => `${SEVERITY_LABELS[Number(n)] ?? 'Unknown'} (${Number(n) || '?'}/4)`
const ticketLink = (ticket) => `${(process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '')}/incidents/${ticket._id}/timeline`

// Emails a saved notification and records whether it worked. Never throws.
async function sendEmail(doc, recipient, ticket) {
	const transport = mailer()
	if (!transport) {
		await Notification.updateOne({ _id: doc._id }, { $set: { 'email.status': 'skipped', 'email.error': 'SMTP_HOST is not set' } })
		return
	}
	const link = ticket ? ticketLink(ticket) : null
	const facts = [
		doc.ticketRef && ['Incident', `${doc.ticketRef} (${ticket._id})`],
		ticket && ['Title', ticket.title],
		doc.service && ['Service', serviceLabel(doc.service)],
		doc.severity && ['Severity', severityText(doc.severity)],
		doc.action && ['Action needed', doc.action],
	].filter(Boolean)
	const text = [
		`Hi ${recipient.name},`, '', doc.message, '',
		...facts.map(([k, v]) => `${k}: ${v}`),
		...(link ? ['', `Open the incident: ${link}`] : []),
		'', 'Residence Ticketing',
	].join('\n')
	const html = `<p>Hi ${escapeHtml(recipient.name)},</p><p>${escapeHtml(doc.message)}</p>`
		+ `<table cellpadding="4" style="border-collapse:collapse">${facts.map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>`
		+ (link ? `<p><a href="${escapeHtml(link)}">Open the incident</a></p>` : '')
		+ '<p style="color:#6b6b6b">Residence Ticketing</p>'
	try {
		await transport.sendMail({
			from: process.env.SMTP_FROM || 'Residence Ticketing <no-reply@residence.test>',
			to: recipient.email,
			subject: doc.title,
			text,
			html,
		})
		await Notification.updateOne({ _id: doc._id }, { $set: { 'email.status': 'sent', 'email.sentAt': new Date() } })
	} catch (err) {
		console.error(`[notify] Email to ${recipient.email} failed: ${err.message}`)
		await Notification.updateOne({ _id: doc._id }, { $set: { 'email.status': 'failed', 'email.error': err.message.slice(0, 300) } })
	}
}

// Saves the notification, then emails it in the background. Never throws.
async function notify(userId, { ticket, type, title, message, action }) {
	try {
		const recipient = await User.findById(userId).select('name email active')
		if (!recipient) return null
		const doc = await Notification.create({
			user: recipient._id,
			ticket: ticket?._id,
			type,
			title,
			message,
			ticketRef: ticket ? ticketRef(ticket) : undefined,
			service: ticket?.service,
			severity: ticket?.severity,
			action,
			email: { status: 'pending', to: recipient.email },
		})
		sendEmail(doc, recipient, ticket).catch((err) => console.error('[notify] email step failed:', err.message))
		return doc
	} catch (err) {
		console.error('[notify] Could not save notification:', err.message)
		return null
	}
}

const ACK_ACTION = 'Acknowledge it in the Team Queue (open the incident and press "Acknowledge"). Until someone acknowledges it, it keeps moving up the escalation policy.'

// Tells a solver a ticket was assigned to them.
// how: 'on-call' (when filed), 'lead' (reassigned by the lead) or 'escalation'
function notifyAssigned(ticket, userId, { how, by, level } = {}) {
	const ref = ticketRef(ticket)
	const reason = how === 'escalation'
		? `It was escalated to you (level ${level}) because nobody acknowledged it in time.`
		: how === 'lead'
			? `${by || 'Your team lead'} assigned it to you.`
			: "It was assigned to you automatically because you're on call."
	return notify(userId, {
		ticket,
		type: 'assigned',
		title: `${how === 'escalation' ? 'Escalated' : 'Assigned'}: incident ${ref} – ${serviceLabel(ticket.service)}, ${SEVERITY_LABELS[Number(ticket.severity)] ?? ''} severity`,
		message: `Incident ${ref} "${ticket.title}" (unit ${ticket.unit}) needs you. ${reason}`,
		action: ACK_ACTION,
	})
}

// Tells the team lead and admins that a ticket went through every level unacknowledged.
async function notifyFinal(ticket, teamName, recipientIds) {
	const ref = ticketRef(ticket)
	const unique = [...new Set(recipientIds.filter(Boolean).map(String))]
	return Promise.all(unique.map((id) => notify(id, {
		ticket,
		type: 'final',
		title: `FINAL ESCALATION: incident ${ref} (${teamName}) was never acknowledged`,
		message: `Incident ${ref} "${ticket.title}" (unit ${ticket.unit}) went through every level of ${teamName}'s escalation policy without anyone acknowledging it. It is now unassigned and pinned to the top of ${teamName}'s Team Queue.`,
		action: 'Get someone on it now: acknowledge it yourself, or have a solver on the team acknowledge it.',
	})))
}

// The reporter only hears when their ticket is acknowledged and when it's resolved.
function notifyReporter(ticket, reporterId, kind, byName) {
	const ref = ticketRef(ticket)
	const acknowledged = kind === 'acknowledged'
	return notify(reporterId, {
		ticket,
		type: kind,
		title: acknowledged ? `Your incident ${ref} was acknowledged` : `Your incident ${ref} was resolved`,
		message: acknowledged
			? `${byName || 'A solver'} acknowledged "${ticket.title}" and is taking responsibility for it.`
			: `"${ticket.title}" was marked resolved${byName ? ` by ${byName}` : ''}. If the problem is still there, comment on the incident so the team can reopen it.`,
		action: acknowledged ? 'No action needed. We will email you again when it is resolved.' : 'No action needed unless the problem is still there.',
	})
}

module.exports = { notify, notifyAssigned, notifyFinal, notifyReporter, ticketRef, SEVERITY_LABELS }
