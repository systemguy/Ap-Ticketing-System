import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// change this if your backend runs somewhere else
const API_URL = 'http://localhost:3000';

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

      const url = isLogin ? `${API_URL}/login` : `${API_URL}/register`;
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
        if (Array.isArray(data.error)) {
          setMessage(data.error.join(', '));
        }
        else if (typeof data.error === 'string') {
          setMessage(data.error);
        }else{
          setMessage(data.message || 'Invalid username or password')
        }
        return;
      }
      if (data.token) {
        localStorage.setItem('token', data.token); // Save Bearer token
      }
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
