import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{ArrowRight,Eye,EyeOff,LockKeyhole,ShieldCheck}from'lucide-react';
import{supabase}from'./lib/supabase';
import'./login.css';

const roleDest={admin:'/admin.html',client:'/portal.html',employer:'/dashboard.html',employee:'/dashboard.html',reseller:'/dashboard.html'};

async function destinationFor(session){
  if(!session?.user)return'/login.html';
  const{data,error}=await supabase.from('profiles').select('role,is_active').eq('id',session.user.id).maybeSingle();
  if(error)throw error;
  if(!data)return null;
  if(data.is_active===false)throw new Error('Your account is inactive. Please contact IJ Langa Consulting.');
  return roleDest[data.role]||'/dashboard.html';
}

function Login(){
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{supabase.auth.getSession().then(async({data})=>{if(!data.session)return;try{const dest=await destinationFor(data.session);if(dest)window.location.replace(dest)}catch(e){setError(e.message||'Could not load your account.')}})},[]);
 async function signIn(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{const{data,error:e2}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});if(e2)throw e2;const dest=await destinationFor(data.session);if(!dest)throw new Error('Your account is not provisioned yet. Please ask IJ Langa Consulting to activate your portal access.');window.location.replace(dest)}catch(e){setError(e.message||'Sign-in failed. Please check your details.')}finally{setBusy(false)}}
 async function reset(){setBusy(true);setError('');setMessage('');try{if(!email.trim())throw new Error('Enter your email address first.');const{error:e}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:`${window.location.origin}/login.html`});if(e)throw e;setMessage('If an account exists for that email, a password-reset email will be sent.')}catch(e){setError(e.message||'Could not start password reset.')}finally{setBusy(false)}}
 return <main className="login-page"><div className="login-shell"><section className="login-brand"><div className="login-logo"><img src="/ijlanga-logo.svg" alt="IJ Langa Consulting logo"/></div><span className="login-eyebrow">IJ LANGA CONSULTING</span><h1>One secure sign-in for every role.</h1><p>Access the workspace assigned to you — client, employer, employee, reseller or administrator.</p><div className="login-trust"><div><ShieldCheck size={18}/><span>Role-based access</span></div><div><LockKeyhole size={18}/><span>Supabase Auth security</span></div></div></section><section className="login-card"><span className="login-eyebrow">SECURE ACCESS</span><h2>Sign in</h2><p className="login-muted">Use the email and password provided for your IJ Langa account.</p><form onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com"/></label><label>Password<div className="password-wrap"><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required placeholder="Your password"/><button type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>{error&&<div className="login-error">{error}</div>}{message&&<div className="login-message">{message}</div>}<button className="login-submit" disabled={busy}>{busy?'Signing in…':<>Sign in <ArrowRight size={17}/></>}</button></form><button className="login-reset" disabled={busy} onClick={reset}>Forgot your password?</button><a className="login-home" href="/">← Return to website</a></section></div></main>}

createRoot(document.getElementById('root')).render(<Login/>);
