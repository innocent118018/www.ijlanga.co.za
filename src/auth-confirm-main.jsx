import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{supabase}from'./lib/supabase';
import'./auth-confirm.css';

function App(){
 const params=new URLSearchParams(window.location.search);
 const hashParams=new URLSearchParams(window.location.hash.replace(/^#/,''));
 const type=params.get('type')||hashParams.get('type')||'email';
 const tokenHash=params.get('token_hash')||'';
 const code=params.get('code')||'';
 const accessToken=hashParams.get('access_token')||'';
 const refreshToken=hashParams.get('refresh_token')||'';
 const target=params.get('redirect_to')||'/dashboard.html';
 const[state,setState]=useState(tokenHash||code||accessToken?'checking':type==='recovery'?'recovery-options':'error'),[message,setMessage]=useState(tokenHash||code||accessToken?'Verifying your secure account link…':type==='recovery'?'Enter the email and one-time code from your reset email.':'This verification link is incomplete or invalid. Please request a new email.');
 const[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[email,setEmail]=useState(''),[otp,setOtp]=useState(''),[busy,setBusy]=useState(false);

 useEffect(()=>{
  let active=true;
  const finishEmailVerification=async()=>{
   const{error:markError}=await supabase.rpc('mark_email_verified');
   if(markError)throw markError;
   const{error:syncError}=await supabase.functions.invoke('sync-auth-profile');
   if(syncError)throw syncError;
  };
  const run=async()=>{
   try{
    if(code){
      const{error}=await supabase.auth.exchangeCodeForSession(code);
      if(error)throw error;
      if(type==='recovery'){
        if(active){setState('password');setMessage('Your reset link is verified. Choose a new password below.');}
        return;
      }
      await finishEmailVerification();
      if(active){setState('success');setMessage('Your account verification was successful. Redirecting…');setTimeout(()=>{window.location.href=target},800);}
      return;
    }
    if(accessToken&&refreshToken){
      const{error}=await supabase.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
      if(error)throw error;
      if(type==='recovery'){
        if(active){setState('password');setMessage('Your reset link is verified. Choose a new password below.');}
        return;
      }
      await finishEmailVerification();
      if(active){setState('success');setMessage('Your account verification was successful. Redirecting…');setTimeout(()=>{window.location.href=target},800);}
      return;
    }
    if(tokenHash){
      const verifyType=type==='signup'||type==='confirmation'||type==='magiclink'?'email':type;
      const{error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:verifyType});
      if(error)throw error;
      if(verifyType==='recovery'){
        if(active){setState('password');setMessage('Your reset link is verified. Choose a new password below.');}
        return;
      }
      await finishEmailVerification();
      if(active){setState('success');setMessage('Your account verification was successful. Redirecting…');setTimeout(()=>{window.location.href=target},800);}
      return;
    }
    if(type==='recovery'){
      const{data:{session}}=await supabase.auth.getSession();
      if(session){
        if(active){setState('password');setMessage('Your reset session is ready. Choose a new password below.');}
        return;
      }
      if(active){setState('recovery-options');setMessage('Enter the email address and one-time code from your reset email.');}
      return;
    }
    if(active){setState('error');setMessage('This verification link is incomplete or invalid. Please request a new email.');}
   }catch(e){
    if(active){
      if(type==='recovery'){setState('recovery-options');setMessage(e?.message||'The reset link could not be verified. Request a new reset email and try again.');}
      else{setState('error');setMessage(e?.message||'This verification link has expired or is no longer valid. Please request a new one.');}
    }
   }
  };
  const{data:listener}=supabase.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'&&session&&active){
      setState('password');setMessage('Your reset link is verified. Choose a new password below.');
    }
  });
  run();
  return()=>{active=false;listener?.subscription?.unsubscribe?.()};
 },[]);

 async function verifyCode(e){
  e.preventDefault();setBusy(true);setMessage('');
  try{
   if(!email.trim()||!otp.trim())throw new Error('Enter the email address and one-time code from the reset email.');
   const{error}=await supabase.auth.verifyOtp({email:email.trim().toLowerCase(),token:otp.trim(),type:'recovery'});
   if(error)throw error;
   setState('password');setMessage('Your verification code is valid. Choose a new password below.');
  }catch(e){setMessage(e?.message||'The verification code is invalid or expired.')}
  finally{setBusy(false)}
 }

 async function changePassword(e){
  e.preventDefault();setBusy(true);setMessage('');
  try{
   if(password.length<8)throw new Error('Your new password must be at least 8 characters.');
   if(password!==confirm)throw new Error('The passwords do not match.');
   const{data,error}=await supabase.auth.updateUser({password});
   if(error)throw error;
   if(!data?.user)throw new Error('The password was not updated. Please request a new reset link and try again.');
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
  {(state==='recovery-options'||state==='checking'&&type==='recovery')&&<form className="reset-form" onSubmit={verifyCode}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><label>One-time code<input inputMode="numeric" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} maxLength={10} required/></label><button disabled={busy}>{busy?'Verifying…':'Verify code'}</button></form>}
  {state==='password'&&<form className="reset-form" onSubmit={changePassword}><label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete="new-password"/></label><label>Confirm new password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} required autoComplete="new-password"/></label><button disabled={busy}>{busy?'Saving…':'Set new password'}</button></form>}
  {(state==='changed'||state==='error')&&<a href="/dashboard.html">Return to sign in</a>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);