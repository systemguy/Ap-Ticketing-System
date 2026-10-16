import { useState } from 'react';
import { departmentServices, departments, serviceLabel } from '../data/services';
import { SEVERITIES } from '../data/severity';
import { ACCEPTED_IMAGE_TYPES, compressImage } from '../utils/images';

// The backend stores only the service, so find its department for the edit form.
function departmentOf(service) {
  return departments.find((d) => departmentServices[d].includes(service)) || departments[0];
}

// Shared by "Report an issue" (/tickets/new) and the edit form on the team queue.
// onSubmit(payload) should throw an Error with a readable message if saving fails;
// the form stays filled in so nothing typed is lost.
export default function TicketForm({ initial = null, onSubmit, onCancel, submitLabel }) {
  const editing = Boolean(initial);
  const initialService = initial ? initial.service || initial.type || '' : '';
  const initialDepartment = initialService ? departmentOf(initialService) : departments[0];

  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [unit, setUnit] = useState(initial?.unit || '');
  const [department, setDepartment] = useState(initialDepartment);
  const [service, setService] = useState(initialService || departmentServices[initialDepartment][0]);
  const [severity, setSeverity] = useState(initial?.severity ? String(initial.severity) : '');
  const [photo, setPhoto] = useState(''); // compressed data URL
  const [photoNote, setPhotoNote] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Keep a saved service selectable even if it's no longer in the department list
  const serviceOptions = departmentServices[department] || [];
  const options = serviceOptions.includes(service) || !service ? serviceOptions : [service, ...serviceOptions];

  function changeDepartment(next) {
    setDepartment(next);
    setService(departmentServices[next][0]);
  }

  async function choosePhoto(e) {
    const file = e.target.files?.[0];
    setPhotoNote('');
    if (!file) {
      setPhoto('');
      return;
    }
    setPhotoBusy(true);
    try {
      setPhoto(await compressImage(file));
    } catch (err) {
      setPhoto('');
      setPhotoNote(err.message);
      e.target.value = '';
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto() {
    setPhoto('');
    setPhotoNote('');
    const input = document.getElementById('ticket-photo');
    if (input) input.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) {
      setError('Please describe the issue.');
      return;
    }
    const payload = {
      title: title.trim(),
      unit: unit.trim(),
      description: trimmed,
      service,
      severity: Number(severity),
      type: service, // the ticket model still requires type
    };
    if (photo) payload.photo = photo;

    setSaving(true);
    setError('');
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ticket-form">
      <div className="form-group">
        <label htmlFor="ticket-issue">Issue</label>
        <input
          id="ticket-issue"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Kitchen sink is leaking"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="ticket-description">Description</label>
        <textarea
          id="ticket-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="What is wrong, when did it start, and anything staff should know?"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="ticket-location">Location</label>
        <input
          id="ticket-location"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="Unit number or common area, e.g. 4B or Laundry room"
          required
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="ticket-department">Department / Team</label>
          <select id="ticket-department" value={department} onChange={(e) => changeDepartment(e.target.value)}>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="ticket-service">Service</label>
          <select id="ticket-service" value={service} onChange={(e) => setService(e.target.value)}>
            {options.map((svc) => (
              <option key={svc} value={svc}>{serviceLabel(svc)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="ticket-severity">Severity</label>
        <select id="ticket-severity" value={severity} onChange={(e) => setSeverity(e.target.value)} required>
          <option value="" disabled>Choose a severity</option>
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>{s.value} · {s.label}</option>
          ))}
        </select>
        <ul className="severity-help">
          {SEVERITIES.map((s) => (
            <li key={s.value}><strong>{s.value} {s.label}:</strong> {s.description}</li>
          ))}
        </ul>
      </div>

      {!editing && (
        <div className="form-group">
          <label htmlFor="ticket-photo">Photo (optional)</label>
          <input
            id="ticket-photo"
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={choosePhoto}
            className="file-input"
          />
          {photoBusy && <p className="field-hint">Preparing photo…</p>}
          {photoNote && <p className="field-error">{photoNote}</p>}
          {photo && (
            <div className="photo-preview">
              <img src={photo} alt="Preview of the photo attached to this ticket" />
              <button type="button" className="btn btn-outline btn-small" onClick={removePhoto}>
                Remove photo
              </button>
            </div>
          )}
          <p className="field-hint">A picture helps staff bring the right parts. It's resized before upload.</p>
        </div>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="btn" disabled={saving || photoBusy}>
          {saving ? 'Saving…' : submitLabel || (editing ? 'Save changes' : 'Submit ticket')}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
