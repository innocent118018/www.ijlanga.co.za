import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{supabase}from'./lib/supabase';
import'./auth-confirm.css';

function App(){
 const[email,setEmail]=useState('');const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');const[error,setError]=useState('');
 async function submit(e){e.preventDefault();setBusy(true);setMessage('');setError('');try{const{error:e2}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:`${window.location.origin}/reset-password.html`});if(e2)throw e2;setMessage('If an account exists for this email address, a secure password-reset link has been sent. Check your inbox and spam folder.')}catch(e2){setError(e2.message||'Could not send the reset email.')}finally{setBusy(false)}}
 return <main className="auth-confirm"><section><div className="auth-confirm-icon">🔐</div><span>IJ LANGA CONSULTING</span><h1>Forgot your password?</h1><p>We will send a secure reset link to the email address associated with your account.</p><form className="reset-form" onSubmit={submit}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}<button disabled={busy}>{busy?'Sending…':'Send reset link'}</button></form><p><a href="/dashboard.html">Return to sign in</a></p></section></main>
}
createRoot(document.getElementById('root')).render(<App/>);
