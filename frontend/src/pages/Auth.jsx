import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, TOKEN_KEY } from '../api/client';
import { homePathFor, useSession } from '../context/SessionContext';
import { ACCEPTED_IMAGE_TYPES } from '../utils/images';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // matches the backend's multer limit

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(null); // File, register only
  const [avatarPreview, setAvatarPreview] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useSession();

  // Free the preview URL when the picture changes or the page closes
  useEffect(() => () => avatarPreview && URL.revokeObjectURL(avatarPreview), [avatarPreview]);

  function switchMode(login) {
    setIsLogin(login);
    setMessage('');
  }

  function chooseAvatar(e) {
    const file = e.target.files?.[0];
    setMessage('');
    if (!file) {
      setAvatar(null);
      setAvatarPreview('');
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setMessage('Profile picture must be a PNG, JPEG, GIF or WebP image.');
      e.target.value = '';
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setMessage('Profile picture must be 2 MB or smaller.');
      e.target.value = '';
      return;
    }
    setAvatar(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const url = isLogin ? `${API_BASE}/login` : `${API_BASE}/register`;
      let options;
      if (!isLogin && avatar) {
        // The backend's register route takes the picture as multipart field "avatar"
        const form = new FormData();
        form.append('name', name);
        form.append('email', email);
        form.append('password', password);
        form.append('avatar', avatar);
        options = { method: 'POST', body: form }; // the browser sets the multipart header
      } else {
        const body = isLogin ? { email, password } : { name, email, password };
        options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      }

      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // data.error is a list for password rules, a string otherwise
        setMessage(data.error || data.message || 'Invalid email or password');
        return;
      }
      if (data.token) localStorage.setItem(TOKEN_KEY, data.token); // Save Bearer token
      refresh(); // tell the navbar and route guards who is logged in
      // Staff go to their team queue, residents to their own incidents
      navigate(homePathFor(data.token), { replace: true });
    } catch (err) {
      console.error(err);
      setMessage('Could not connect to the server');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page page-narrow">
      <p className="eyebrow">{isLogin ? 'Welcome back' : 'New resident or staff'}</p>
      <h1>{isLogin ? 'Login' : 'Register'}</h1>

      <div className="segmented auth-switch" role="tablist" aria-label="Login or register">
        <button type="button" role="tab" aria-selected={isLogin} className={isLogin ? 'active' : ''} onClick={() => switchMode(true)}>
          Login
        </button>
        <button type="button" role="tab" aria-selected={!isLogin} className={!isLogin ? 'active' : ''} onClick={() => switchMode(false)}>
          Register
        </button>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="auth-name">Name</label>
              <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
            />
            {!isLogin && (
              <p className="field-hint">
                At least 10 characters, with an uppercase letter, a lowercase letter, a number and a symbol.
              </p>
            )}
          </div>

          {!isLogin && (
            <div className="form-group">
              <label htmlFor="auth-avatar">Profile picture (optional)</label>
              <div className="avatar-picker">
                <img src={avatarPreview || '/default-avatar.svg'} alt="" className="avatar-picker-preview" />
                <input
                  id="auth-avatar"
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  onChange={chooseAvatar}
                  className="file-input"
                />
              </div>
              <p className="field-hint">PNG, JPEG, GIF or WebP, up to 2 MB.</p>
            </div>
          )}

          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Please wait…' : isLogin ? 'Login' : 'Create Account'}
          </button>
        </form>

        {Array.isArray(message) ? (
          <ul className="form-errors">
            {message.map((m) => <li key={m}>{m}</li>)}
          </ul>
        ) : (
          message && <p className="field-error" role="alert">{message}</p>
        )}
      </div>
    </main>
  );
}

export default Auth;
