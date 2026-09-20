import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{supabase}from'./lib/supabase';
import'./auth-confirm.css';

function App(){
 const[state,setState]=useState('checking'),[message,setMessage]=useState('Verifying your secure account link…');
 const[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[redirectTo,setRedirectTo]=useState('/dashboard.html');
 const params=new URLSearchParams(window.location.search);
 const type=params.get('type')||'email'; const tokenHash=params.get('token_hash')||'';
 const target=params.get('redirect_to')||'/dashboard.html';
 useEffect(()=>{setRedirectTo(target);(async()=>{
   if(!tokenHash){setState('error');setMessage('This verification link is incomplete or invalid. Please request a new email.');return}
   try{
    const{error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type});
    if(error)throw error;
    if(type==='recovery'){setState('password');setMessage('Your reset link is verified. Choose a new password below.');return}
    setState('success');setMessage('Your account verification was successful. Redirecting…');
    setTimeout(()=>{window.location.href=target},800);
   }catch(e){setState('error');setMessage(e?.message||'This verification link has expired or is no longer valid. Please request a new one.')}
 })()},[]);
 async function changePassword(e){
  e.preventDefault();setBusy(true);setMessage('');
  try{
   if(password.length<8)throw new Error('Your new password must be at least 8 characters.');
   if(password!==confirm)throw new Error('The passwords do not match.');
   const{error}=await supabase.auth.updateUser({password});
   if(error)throw error;
   await supabase.auth.signOut();
   setPassword('');setConfirm('');setState('changed');setMessage('Your password has been changed successfully. You can now sign in.');
  }catch(e){setMessage(e?.message||'Could not change your password.')}
  finally{setBusy(false)}
 }
 return <main className="auth-confirm"><section>
  <div className={'auth-confirm-icon '+state}>{state==='success'||state==='changed'?'✓':state==='error'?'!':state==='password'?'🔐':'…'}</div>
  <span>IJ LANGA CONSULTING</span>
  <h1>{state==='success'?'Verified successfully':state==='password'?'Create a new password':state==='changed'?'Password changed':state==='error'?'Verification failed':'Securing your account'}</h1>
  <p>{message}</p>
  {state==='password'&&<form className="reset-form" onSubmit={changePassword}>
   <label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete="new-password"/></label>
   <label>Confirm new password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} required autoComplete="new-password"/></label>
   <button disabled={busy}>{busy?'Saving…':'Set new password'}</button>
  </form>}
  {(state==='changed'||state==='error')&&<a href="/dashboard.html">Return to sign in</a>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);