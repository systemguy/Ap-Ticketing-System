import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../api/client';

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  // function handleSubmit(e) {
  //   e.preventDefault();

  //   const url = isLogin ? `${API_URL}/login` : `${API_URL}/register`;
  //   const body = isLogin ? { email, password } : { name, email, password };

  //   fetch(url, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(body),
  //   })
      
  //     .then((res) => res.json(), console.log(body))
  //     .then(() => {
  //       setMessage(isLogin ? 'Logged in!' : 'Account created!');
  //     })
  //     .catch((err) => {
  //       console.log(err)
  //       setMessage('Could not connect to the server yet.' +err);
        
  //     });
  // }

  const handleSubmit = async(e) =>{
    e.preventDefault();
    

    try{

      const url = isLogin ? `${API_BASE}/login` : `${API_BASE}/register`;
      const body = isLogin ? { email, password } : { name, email, password };
      const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      })
      
      const data = await res.json()
      console.log(data)
      if(!res.ok){
        console.log(data)
        // data.error is a list for password rules, a string otherwise
        setMessage(data.error || data.message || 'Invalid username or password')
        return;
      }
      if (data.token) {
        localStorage.setItem('token', data.token); // Save Bearer token
      }
      localStorage.setItem('loggedIn', 'true');
      setMessage("Login successful")
      navigate('/incidents')
    }catch(err){
      console.log(err)
      setMessage("Could not connect to the server")
    }
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
            {!isLogin && (
              <p className="field-hint">
                At least 10 characters, with an uppercase letter, a lowercase letter, a number and a symbol.
              </p>
            )}
          </div>

          <button type="submit" className="btn">
            {isLogin ? 'Login' : 'Create Account'}
          </button>
        </form>

        {Array.isArray(message) ? (
          <ul className="form-errors">
            {message.map((m) => <li key={m}>{m}</li>)}
          </ul>
        ) : (
          message && <p>{message}</p>
        )}
      </div>
    </div>
  );
}

export default Auth;
