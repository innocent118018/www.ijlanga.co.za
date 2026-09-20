import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{supabase}from'./lib/supabase';
import'./auth-confirm.css';

const SITE='https://www.ijlanga.co.za';
const dashboard=SITE+'/dashboard.html';

function App(){
 const params=new URLSearchParams(window.location.search);
 const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
 const type=params.get('type')||hash.get('type')||'email';
 const tokenHash=params.get('token_hash')||'';
 const code=params.get('code')||'';
 const accessToken=hash.get('access_token')||'';
 const refreshToken=hash.get('refresh_token')||'';
 const target=params.get('redirect_to')||dashboard;
 const[state,setState]=useState(tokenHash||code||accessToken?'checking':type==='recovery'?'recovery-options':'error');
 const[message,setMessage]=useState(tokenHash||code||accessToken?'Verifying your IJ Langa account…':type==='recovery'?'Enter the email address and one-time code from your password-reset email.':'This verification link is incomplete or invalid. Please request a new one.');
 const[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[email,setEmail]=useState(''),[otp,setOtp]=useState(''),[busy,setBusy]=useState(false);

 const routeAfterAuth=async()=>{
   const{data:{user},error:userError}=await supabase.auth.getUser();
   if(userError||!user)throw userError||new Error('The verified session could not be loaded.');
   const{data:profile,error:profileError}=await supabase.from('profiles').select('role,is_active,approval_status').eq('id',user.id).maybeSingle();
   if(profileError)throw profileError;
   if(!profile)throw new Error('Your account profile was not found. Please contact info@ijlanga.co.za.');
   if(profile.is_active){
     setState('success');setMessage('Your account has been verified and is active. Signing you in and opening your dashboard…');
     setTimeout(()=>{window.location.href=target||dashboard},700);
   }else{
     setState('pending');setMessage(profile.approval_status==='pending'
       ?'Your email has been verified successfully. Your account is now waiting for IJ Langa administrator approval. You will be able to sign in when approval is complete.'
       :'Your email has been verified, but your account is currently inactive. Please contact info@ijlanga.co.za.');
   }
 };

 const finishSignup=async()=>{
   const{error:markError}=await supabase.rpc('mark_email_verified');
   if(markError)throw markError;
   const{error:syncError}=await supabase.functions.invoke('sync-auth-profile');
   if(syncError)throw syncError;
   await routeAfterAuth();
 };

 useEffect(()=>{
   let live=true;
   const run=async()=>{
     try{
       if(code){
         const{error}=await supabase.auth.exchangeCodeForSession(code);
         if(error)throw error;
         if(type==='recovery'){if(live){setState('password');setMessage('Your password-reset link is verified. Choose a new password below.');}return;}
         await finishSignup();return;
       }
       if(accessToken&&refreshToken){
         const{error}=await supabase.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
         if(error)throw error;
         if(type==='recovery'){if(live){setState('password');setMessage('Your password-reset session is ready. Choose a new password below.');}return;}
         await finishSignup();return;
       }
       if(tokenHash){
         const verifyType=['signup','confirmation','magiclink'].includes(type)?'email':type;
         const{error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:verifyType});
         if(error)throw error;
         if(verifyType==='recovery'){if(live){setState('password');setMessage('Your password-reset link is verified. Choose a new password below.');}return;}
         await finishSignup();return;
       }
       if(type==='recovery'){
         const{data:{session}}=await supabase.auth.getSession();
         if(session){if(live){setState('password');setMessage('Your password-reset session is ready. Choose a new password below.');}return;}
         if(live){setState('recovery-options');setMessage('Enter the email address and one-time code from your password-reset email.');}
         return;
       }
       if(live){setState('error');setMessage('This verification link is incomplete or invalid. Request a new confirmation email and try again.');}
     }catch(e){
       if(live){setState(type==='recovery'?'recovery-options':'error');setMessage(e?.message||'Verification failed. Request a new link or contact info@ijlanga.co.za.');}
     }
   };
   const{data:listener}=supabase.auth.onAuthStateChange((event,session)=>{
     if(event==='PASSWORD_RECOVERY'&&session&&live){setState('password');setMessage('Your password-reset session is ready. Choose a new password below.');}
   });
   run();
   return()=>{live=false;listener?.subscription?.unsubscribe?.()};
 },[]);

 async function verifyCode(e){
   e.preventDefault();setBusy(true);setMessage('');
   try{
     const em=email.trim().toLowerCase();
     const tok=otp.trim();
     if(!em||!tok)throw new Error('Enter both your email address and the one-time code.');
     const{error}=await supabase.auth.verifyOtp({email:em,token:tok,type:'recovery'});
     if(error)throw error;
     setState('password');setMessage('The reset code is valid. Choose a new password below.');
   }catch(e){setState('recovery-options');setMessage(e?.message||'The reset code is invalid or expired. Request a new password-reset email.')}
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
     if(!user?.email)throw new Error('The password was not updated because the recovery session is missing. Request a new reset email.');
     await supabase.auth.signOut();
     const{data:login,error:loginError}=await supabase.auth.signInWithPassword({email:user.email,password});
     if(loginError||!login?.session)throw loginError||new Error('Password changed, but automatic sign-in could not be completed. Please sign in manually.');
     const{data:profile,error:profileError}=await supabase.from('profiles').select('role,is_active,approval_status').eq('id',login.user.id).maybeSingle();
     if(profileError)throw profileError;
     if(!profile?.is_active){
       await supabase.auth.signOut();
       setState('pending');setMessage('Your password has been changed successfully. Your account is still awaiting IJ Langa approval before dashboard access is enabled.');
       return;
     }
     setState('changed');setMessage('Your password has been changed and you are signed in. Opening your dashboard…');
     setTimeout(()=>{window.location.href=dashboard},700);
   }catch(e){setState('password');setMessage(e?.message||'Could not change your password. Please request a new reset link.')}
   finally{setBusy(false)}
 }

 const title=state==='success'?'Verified successfully':state==='pending'?'Verification complete':state==='password'?'Create a new password':state==='changed'?'Password changed':state==='error'?'Verification failed':'Secure account verification';
 return <main className="auth-confirm"><section>
   <div className={'auth-confirm-icon '+state}>{state==='success'||state==='changed'||state==='pending'?'✓':state==='error'?'!':state==='password'?'🔐':'…'}</div>
   <span>IJ LANGA CONSULTING</span><h1>{title}</h1><p>{message}</p>
   {(state==='recovery-options'||(state==='checking'&&type==='recovery'))&&<form className="reset-form" onSubmit={verifyCode}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><label>One-time code<input inputMode="numeric" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} maxLength={10} required/></label><button disabled={busy}>{busy?'Verifying…':'Verify reset code'}</button></form>}
   {state==='password'&&<form className="reset-form" onSubmit={changePassword}><label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete="new-password"/></label><label>Confirm new password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} required autoComplete="new-password"/></label><button disabled={busy}>{busy?'Saving…':'Set new password'}</button></form>}
   {(state==='pending'||state==='error')&&<a href="/dashboard.html">Return to secure sign in</a>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);