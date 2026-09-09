import { useState } from 'react';

// change this if your backend runs somewhere else
const API_URL = 'http://localhost:4000';

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  function handleSubmit(e) {
    e.preventDefault();

    const url = isLogin ? `${API_URL}/auth/login` : `${API_URL}/auth/register`;
    const body = isLogin ? { email, password } : { name, email, password };

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => res.json())
      .then(() => {
        setMessage(isLogin ? 'Logged in!' : 'Account created!');
      })
      .catch(() => {
        setMessage('Could not connect to the server yet.');
      });
  }

  return (
    <div className="page">
      <h1>{isLogin ? 'Login' : 'Register'}</h1>

      <div style={{ marginBottom: '15px' }}>
        <button className="btn" onClick={() => setIsLogin(true)}>Login</button>
        <button className="btn btn-outline" onClick={() => setIsLogin(false)}>Register</button>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn">
            {isLogin ? 'Login' : 'Create Account'}
          </button>
        </form>

        {message && <p>{message}</p>}
      </div>
    </div>
  );
}

export default Auth;
