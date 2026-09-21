import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{supabase}from'./lib/supabase';
import'./auth-confirm.css';

const SITE='https://www.ijlanga.co.za';
const DASHBOARD=SITE+'/dashboard.html';
const SIGNIN=SITE+'/dashboard.html';
const RESET_FN='https://pyhcmceyhrulkwzedwgf.supabase.co/functions/v1/request-password-reset';

function safeTarget(value){
 try{
  const u=new URL(value||DASHBOARD,SITE);
  if(u.origin!==SITE)return DASHBOARD;
  if(!['/dashboard.html','/portal.html','/admin.html'].includes(u.pathname))return DASHBOARD;
  return u.href;
 }catch{return DASHBOARD}
}

function App(){
 const params=new URLSearchParams(window.location.search);
 const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
 const type=params.get('type')||hash.get('type')||'email';
 const tokenHash=params.get('token_hash')||'';
 const code=params.get('code')||'';
 const accessToken=hash.get('access_token')||'';
 const refreshToken=hash.get('refresh_token')||'';
 const errorCode=hash.get('error_code')||params.get('error_code')||'';
 const errorDescription=hash.get('error_description')||params.get('error_description')||'';
 const target=safeTarget(params.get('redirect_to')||DASHBOARD);
 const hasAuthToken=Boolean(tokenHash||code||(accessToken&&refreshToken));
 const initialState=hasAuthToken?'checking':type==='recovery'?'recovery-request':'request';
 const[state,setState]=useState(errorCode?'error':initialState);
 const[message,setMessage]=useState(
   errorCode?(errorDescription||'Supabase rejected this verification link. Request a new link.'):
   hasAuthToken?'Verifying your IJ Langa account…':
   type==='recovery'?'Enter your email address to receive a new password-reset link.':
   'Enter your email address and we will send a fresh account-verification link.'
 );
 const[email,setEmail]=useState('');
 const[otp,setOtp]=useState('');
 const[password,setPassword]=useState('');
 const[confirm,setConfirm]=useState('');
 const[busy,setBusy]=useState(false);

 const fail=(e,fallback)=>{
  const text=e?.message||fallback;
  setState('error');setMessage(text);
  try{window.alert('Account verification failed: '+text)}catch{}
 };

 const routeAfterAuth=async()=>{
   const{data:{user},error:userError}=await supabase.auth.getUser();
   if(userError||!user)throw userError||new Error('Supabase verified the link, but no signed-in session was returned.');
   const{data:profile,error:profileError}=await supabase.from('profiles').select('role,is_active,approval_status').eq('id',user.id).maybeSingle();
   if(profileError)throw profileError;
   if(!profile)throw new Error('The Supabase profile is missing for this account. Contact info@ijlanga.co.za and provide the email address used for registration.');
   if(profile.is_active){
     setState('success');
     setMessage('Account verified successfully. You are signed in and your dashboard is opening now.');
     try{window.alert('Account verified successfully. You are now signed in.')}catch{}
     setTimeout(()=>{window.location.href=target},700);
   }else{
     setState('pending');
     setMessage(profile.approval_status==='pending'
       ?'Email verified successfully. Your account is now waiting for IJ Langa administrator approval. You will be able to access the dashboard after approval.'
       :'Email verified successfully, but the account is inactive. Contact info@ijlanga.co.za for assistance.');
     try{window.alert('Email verified successfully. Your account is now awaiting administrator approval.')}catch{}
   }
 };

 const finishEmailVerification=async()=>{
   const{error:markError}=await supabase.rpc('mark_email_verified');
   if(markError)throw new Error('Supabase verified the email, but IJ Langa could not record the verification: '+markError.message);
   const{error:syncError}=await supabase.functions.invoke('sync-auth-profile');
   if(syncError)throw new Error('Email was verified, but the profile could not be synchronized: '+syncError.message);
   await routeAfterAuth();
 };

 useEffect(()=>{
   let live=true;
   const run=async()=>{
    try{
      if(errorCode)throw new Error(errorDescription||'The authentication link was rejected by Supabase.');
      if(code){
        const{error}=await supabase.auth.exchangeCodeForSession(code);
        if(error)throw error;
        if(type==='recovery'){if(live){setState('password');setMessage('The password-reset link is verified. Choose a new password below.');}return;}
        await finishEmailVerification();return;
      }
      if(accessToken&&refreshToken){
        const{error}=await supabase.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
        if(error)throw error;
        if(type==='recovery'){if(live){setState('password');setMessage('The password-reset session is ready. Choose a new password below.');}return;}
        await finishEmailVerification();return;
      }
      if(tokenHash){
        const verifyType=type==='signup'||type==='confirmation'||type==='magiclink'?'email':type;
        const{error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:verifyType});
        if(error)throw error;
        if(verifyType==='recovery'){if(live){setState('password');setMessage('The password-reset link is verified. Choose a new password below.');}return;}
        await finishEmailVerification();return;
      }
      if(type==='recovery'){
        const{data:{session}}=await supabase.auth.getSession();
        if(session&&live){setState('password');setMessage('The password-reset session is ready. Choose a new password below.');}
      }
    }catch(e){if(live)fail(e,'Supabase could not verify this link. Request a new link or contact info@ijlanga.co.za.')}
   };
   const{data:listener}=supabase.auth.onAuthStateChange((event,session)=>{
     if(event==='PASSWORD_RECOVERY'&&session&&live){
       setState('password');setMessage('The password-reset session is ready. Choose a new password below.');
     }
   });
   run();
   return()=>{live=false;listener?.subscription?.unsubscribe?.()};
 },[]);

 async function resendVerification(e){
   e.preventDefault();setBusy(true);setState('request');setMessage('');
   try{
    const em=email.trim().toLowerCase();
    if(!em)throw new Error('Enter the email address used for your IJ Langa account.');
    const{error}=await supabase.auth.resend({type:'signup',email:em,options:{emailRedirectTo:SITE+'/account-verification.html?redirect_to='+encodeURIComponent(DASHBOARD)}});
    if(error)throw error;
    setState('sent');setMessage('A fresh verification email has been requested. Open the newest email and click its verification link. If you do not receive it, check spam or contact info@ijlanga.co.za.');
   }catch(e){fail(e,'The verification email could not be requested. Check the email address and contact info@ijlanga.co.za if the problem continues.')}
   finally{setBusy(false)}
 }

 async function requestRecovery(e){
   e.preventDefault();setBusy(true);setState('recovery-request');setMessage('');
   try{
    const em=email.trim().toLowerCase();
    if(!em)throw new Error('Enter the email address used for your IJ Langa account.');
    const response=await fetch(RESET_FN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error||'The password-reset request could not be completed.');
    setState('sent');setMessage(data?.message||'If an account exists, a password-reset email has been sent. Open the newest email and use the link to choose a new password.');
   }catch(e){fail(e,'The password-reset request could not be completed. Contact info@ijlanga.co.za if the problem continues.')}
   finally{setBusy(false)}
 }

 async function verifyRecoveryCode(e){
   e.preventDefault();setBusy(true);setMessage('');
   try{
    const em=email.trim().toLowerCase(),tok=otp.trim();
    if(!em||!tok)throw new Error('Enter both the email address and one-time code.');
    const{error}=await supabase.auth.verifyOtp({email:em,token:tok,type:'recovery'});
    if(error)throw error;
    setState('password');setMessage('The reset code is valid. Choose a new password below.');
   }catch(e){fail(e,'The reset code is invalid or expired. Request a new password-reset email.')}
   finally{setBusy(false)}
 }

 async function changePassword(e){
   e.preventDefault();setBusy(true);setMessage('');
   try{
    if(password.length<8)throw new Error('Your new password must be at least 8 characters.');
    if(password!==confirm)throw new Error('The passwords do not match.');
    const{data,error}=await supabase.auth.updateUser({password});
    if(error)throw error;
    const user=data?.user;
    if(!user?.email)throw new Error('Supabase did not return the account email after the password update. Request a new reset link.');
    const{error:profileError}=await supabase.from('profiles').update({updated_at:new Date().toISOString()}).eq('id',user.id);
    if(profileError)throw profileError;
    const{data:login,error:loginError}=await supabase.auth.signInWithPassword({email:user.email,password});
    if(loginError||!login?.session)throw loginError||new Error('Password changed, but automatic sign-in failed. Please sign in again.');
    const{data:profile,error:readError}=await supabase.from('profiles').select('role,is_active,approval_status').eq('id',login.user.id).maybeSingle();
    if(readError)throw readError;
    if(!profile?.is_active){
      await supabase.auth.signOut();
      setState('pending');setMessage('Password changed successfully. The account is still awaiting IJ Langa approval before dashboard access is enabled.');
      try{window.alert('Password changed successfully. The account is still awaiting administrator approval.')}catch{}
      return;
    }
    setState('success');setMessage('Password changed successfully. You are signed in and your dashboard is opening now.');
    try{window.alert('Password changed successfully. You are now signed in.')}catch{}
    setTimeout(()=>{window.location.href=DASHBOARD},700);
   }catch(e){fail(e,'Could not change the password. Request a new reset link or contact info@ijlanga.co.za.')}
   finally{setBusy(false)}
 }

 const title=state==='success'?'Verification successful':state==='pending'?'Verification complete':state==='password'?'Create a new password':state==='sent'?'Check your email':state==='error'?'Verification failed':type==='recovery'?'Password recovery':'Account verification';
 const icon=state==='success'||state==='pending'?'✓':state==='error'?'!':state==='password'?'🔐':'…';
 return <main className="auth-confirm"><section>
   <div className={'auth-confirm-icon '+state}>{icon}</div><span>IJ LANGA CONSULTING</span><h1>{title}</h1><p>{message}</p>
   {state==='request'&&<form className="reset-form" onSubmit={resendVerification}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><button disabled={busy}>{busy?'Requesting…':'Send verification link'}</button></form>}
   {state==='recovery-request'&&<form className="reset-form" onSubmit={requestRecovery}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><button disabled={busy}>{busy?'Sending…':'Send password-reset link'}</button></form>}
   {state==='password'&&<form className="reset-form" onSubmit={changePassword}><label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete="new-password"/></label><label>Confirm new password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} required autoComplete="new-password"/></label><button disabled={busy}>{busy?'Saving…':'Set new password'}</button></form>}
   {state==='recovery-options'&&<form className="reset-form" onSubmit={verifyRecoveryCode}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><label>One-time code<input inputMode="numeric" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} maxLength={10} required/></label><button disabled={busy}>{busy?'Verifying…':'Verify reset code'}</button></form>}
   {(state==='sent'||state==='pending'||state==='error')&&<div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}><a href={SIGNIN}>Return to secure sign in</a>{state==='error'&&<a href="/account-verification.html">Try verification again</a>}</div>}
   {state!=='password'&&state!=='recovery-options'&&type!=='recovery'&&<p style={{fontSize:12,marginTop:24}}>Need help? Contact <strong>info@ijlanga.co.za</strong>.</p>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);