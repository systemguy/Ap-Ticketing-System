import { useNavigate } from 'react-router-dom';
import TicketForm from '../components/TicketForm';
import { createTicket } from '../api/tickets';
import { timed } from '../api/metrics';
import { useSession } from '../context/SessionContext';

// "Report an issue": open to every logged-in user, so residents can file tickets
// without the team queue page.
export default function NewTicketPage() {
  const navigate = useNavigate();
  const { logout } = useSession();

  async function submit(payload) {
    try {
      const { ticket, assignment } = await timed('submit', () => createTicket(payload));
      // Say who has it now: the on-call solver (who was just notified), or why nobody does yet
      const flash = assignment?.to
        ? `Ticket submitted. ${assignment.to.name} is on call for ${assignment.team} and has been notified.`
        : `Ticket submitted. ${assignment?.reason || 'Nobody is on call for it right now'}, so it's waiting in the team queue and will escalate if nobody acknowledges it.`;
      // Straight to the new ticket's timeline, or the profile if the id didn't come back
      navigate(ticket?._id ? `/incidents/${ticket._id}/timeline` : '/profile', { state: { flash } });
    } catch (err) {
      if (err.status === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      throw err; // TicketForm shows the message and keeps the form filled in
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">New ticket</p>
      <h1>Report an Issue</h1>
      <p className="lede">Tell us what's wrong and where. You can follow the ticket from your profile.</p>
      <div className="card">
        <TicketForm onSubmit={submit} onCancel={() => navigate(-1)} submitLabel="Submit ticket" />
      </div>
    </main>
  );
}
