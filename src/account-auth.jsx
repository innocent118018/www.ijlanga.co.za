import React,{useEffect,useState}from'react';
import{ArrowLeft,CheckCircle2,Eye,EyeOff,FileCheck2,LockKeyhole,Upload,UserRound,X}from'lucide-react';
import{supabase}from'./lib/supabase';
import'./account-auth.css';

const API_URL=import.meta.env.VITE_SUPABASE_URL||'https://pyhcmceyhrulkwzedwgf.supabase.co';
const API_KEY=import.meta.env.VITE_SUPABASE_ANON_KEY||'sb_publishable_INoEkMWhNEbysI8f7OLz9w_99Ohyyeg';

export default function AccountAuth({onClose=false,embedded=false}){
 const[mode,setMode]=useState('choice'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[showPassword,setShowPassword]=useState(false);
 const[form,setForm]=useState({email:'',password:'',first_name:'',last_name:'',surname:'',phone:'',identity_number:'',username:''});
 const[idCopy,setIdCopy]=useState(null),[proofOfAddress,setProofOfAddress]=useState(null);

 useEffect(()=>{
  const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
  if(hash.get('type')==='recovery'||hash.get('access_token'))setMode('reset-complete');
 },[]);

 const update=(key,value)=>setForm(f=>({...f,[key]:value}));
 const clearMessages=()=>{setError('');setNotice('')};
 const go=(next)=>{clearMessages();setMode(next);setShowPassword(false)};
 const resetRedirect=()=>window.location.origin+'/index.html?password-reset=1';

 async function signIn(e){
  e.preventDefault();setBusy(true);clearMessages();
  try{
   const{data,error:e2}=await supabase.auth.signInWithPassword({email:form.email.trim().toLowerCase(),password:form.password});
   if(e2)throw e2;
   if(!data.session)throw new Error('Sign in could not be completed.');
   window.location.href='/dashboard.html';
  }catch(e){setError(e.message||'Could not sign in.')}
  finally{setBusy(false)}
 }

 async function requestPasswordReset(e){
  e.preventDefault();setBusy(true);clearMessages();
  const email=form.email.trim().toLowerCase(),username=form.username.trim();
  if(!email||!username){setBusy(false);setError('Enter both your email address and username to request a password reset.');return}
  try{
   const{error:e2}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:resetRedirect()});
   if(e2)throw e2;
   setNotice('If an account exists for these details, a password-reset email has been sent. Check your inbox and spam folder.');
  }catch(e){setError(e.message||'Could not start password reset.')}
  finally{setBusy(false)}
 }

 async function completePasswordReset(e){
  e.preventDefault();setBusy(true);clearMessages();
  try{
   if(form.password.length<8)throw new Error('Your new password must be at least 8 characters.');
   const{error:e2}=await supabase.auth.updateUser({password:form.password});
   if(e2)throw e2;
   await supabase.auth.signOut();
   window.history.replaceState({},document.title,window.location.pathname);
   setForm(f=>({...f,password:''}));
   setNotice('Your password has been changed successfully. You can now sign in with your new password.');
   setMode('signin');
  }catch(e){setError(e.message||'Could not change your password.')}
  finally{setBusy(false)}
 }

 async function signUp(e){
  e.preventDefault();setBusy(true);clearMessages();
  try{
   if(!idCopy||!proofOfAddress)throw new Error('Please upload both your ID Copy and Proof Of Address.');
   const fd=new FormData();
   Object.entries(form).forEach(([k,v])=>{if(k!=='password'&&k!=='username')fd.append(k,v)});
   fd.append('password',form.password);
   const identity=form.identity_number.trim();
   if(/^[0-9]{13}$/.test(identity)){fd.append('id_number',identity);fd.append('company_registration_number','')}
   else{fd.append('id_number','');fd.append('company_registration_number',identity)}
   fd.append('id_copy',idCopy);fd.append('proof_of_address',proofOfAddress);
   const response=await fetch(API_URL+'/functions/v1/account-registration',{method:'POST',headers:{apikey:API_KEY,Authorization:'Bearer '+API_KEY},body:fd});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||data.error)throw new Error(data.error||'Could not complete registration.');
   setNotice(data.message||'Registration submitted for approval.');setMode('submitted');
  }catch(e){setError(e.message||'Could not create your account.')}
  finally{setBusy(false)}
 }

 const shell=embedded?'account-auth embedded':'account-auth';
 if(mode==='choice')return <div className={shell}><div className="account-auth-card choice-card">{onClose&&<button className="account-close" onClick={onClose} aria-label="Close"><X/></button>}<span className="account-eyebrow">SECURE ACCOUNT ACCESS</span><h1>Sign in or create your account.</h1><p>Choose one option. We will automatically identify your approved profile and open the correct dashboard.</p><div className="auth-choice-grid"><button onClick={()=>go('signin')}><LockKeyhole size={21}/><span><b>Sign in</b><small>Use your existing account</small></span><ArrowLeft size={17}/></button><button onClick={()=>go('signup')}><UserRound size={21}/><span><b>Sign up</b><small>Create or update an account</small></span><ArrowLeft size={17}/></button></div><small className="account-note">There are no role-selection buttons here. Your role is read from your approved profile.</small></div></div>;

 if(mode==='signin')return <div className={shell}><div className="account-auth-card">{onClose&&<button className="account-close" onClick={onClose} aria-label="Close"><X/></button>}<button className="auth-back" onClick={()=>go('choice')}><ArrowLeft size={16}/> Back</button><span className="account-eyebrow">SIGN IN</span><h1>Welcome back.</h1><p>Enter your account details. Your profile determines whether you are sent to Admin, Employer, Employee, Reseller or Client.</p><form className="auth-form" onSubmit={signIn}><label>Email Address<input type="email" value={form.email} onChange={e=>update('email',e.target.value)} required autoComplete="email"/></label><label>Password<div className="password-field"><input type={showPassword?'text':'password'} value={form.password} onChange={e=>update('password',e.target.value)} required autoComplete="current-password"/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>{error&&<div className="auth-error">{error}</div>}{notice&&<div className="auth-notice">{notice}</div>}<button className="auth-primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form><button className="auth-link-button" disabled={busy} onClick={()=>go('reset-request')}>Forgot password?</button><div className="auth-switch">Need an account? <button onClick={()=>go('signup')}>Sign up</button></div></div></div>;

 if(mode==='reset-request')return <div className={shell}><div className="account-auth-card">{onClose&&<button className="account-close" onClick={onClose} aria-label="Close"><X/></button>}<button className="auth-back" onClick={()=>go('signin')}><ArrowLeft size={16}/> Back to sign in</button><span className="account-eyebrow">PASSWORD RESET</span><h1>Reset your password.</h1><p>Enter the email address and username connected to your IJ Langa account. We will send the reset link to the email address.</p><form className="auth-form" onSubmit={requestPasswordReset}><label>Email Address<input type="email" value={form.email} onChange={e=>update('email',e.target.value)} required autoComplete="email"/></label><label>Username<input value={form.username} onChange={e=>update('username',e.target.value)} required autoComplete="username"/></label>{error&&<div className="auth-error">{error}</div>}{notice&&<div className="auth-notice">{notice}</div>}<button className="auth-primary" disabled={busy}>{busy?'Sending reset email…':'Send password reset email'}</button></form><small className="account-note">For security, we do not reveal whether an email or username is registered.</small></div></div>;

 if(mode==='reset-complete')return <div className={shell}><div className="account-auth-card">{onClose&&<button className="account-close" onClick={onClose} aria-label="Close"><X/></button>}<span className="account-eyebrow">NEW PASSWORD</span><h1>Choose a new password.</h1><p>Your password-reset link has been received. Set a new password below.</p><form className="auth-form" onSubmit={completePasswordReset}><label>New Password<div className="password-field"><input type={showPassword?'text':'password'} value={form.password} onChange={e=>update('password',e.target.value)} required minLength={8} autoComplete="new-password"/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>{error&&<div className="auth-error">{error}</div>}{notice&&<div className="auth-notice">{notice}</div>}<button className="auth-primary" disabled={busy}>{busy?'Changing password…':'Change password'}</button></form></div></div>;

 if(mode==='submitted')return <div className={shell}><div className="account-auth-card submitted-card">{onClose&&<button className="account-close" onClick={onClose} aria-label="Close"><X/></button>}<div className="submitted-icon"><CheckCircle2 size={30}/></div><span className="account-eyebrow">REGISTRATION SUBMITTED</span><h1>We received your application.</h1><p>{notice}</p><div className="approval-steps"><div><FileCheck2 size={18}/><span><b>Documents received</b><small>ID Copy and Proof Of Address are stored securely for review.</small></span></div><div><LockKeyhole size={18}/><span><b>Profile checked</b><small>Your account type is matched automatically from your details.</small></span></div><div><CheckCircle2 size={18}/><span><b>Approval required</b><small>You will be able to sign in once the required approval is complete.</small></span></div></div><button className="auth-primary" onClick={()=>go('signin')}>Go to sign in</button></div></div>;

 return <div className={shell}><div className="account-auth-card signup-card">{onClose&&<button className="account-close" onClick={onClose} aria-label="Close"><X/></button>}<button className="auth-back" onClick={()=>go('choice')}><ArrowLeft size={16}/> Back</button><span className="account-eyebrow">SIGN UP</span><h1>Create your account.</h1><p>Use your real details. We check for an existing profile and automatically match an employee account to an employer when the ID number is linked.</p><form className="auth-form" onSubmit={signUp}><div className="auth-two"><label>First Name<input value={form.first_name} onChange={e=>update('first_name',e.target.value)} required autoComplete="given-name"/></label><label>Last Name<input value={form.last_name} onChange={e=>update('last_name',e.target.value)} required/></label></div><label>Surname<input value={form.surname} onChange={e=>update('surname',e.target.value)} required autoComplete="family-name"/></label><div className="auth-two"><label>Email Address<input type="email" value={form.email} onChange={e=>update('email',e.target.value)} required autoComplete="email"/></label><label>Cell Number<input type="tel" value={form.phone} onChange={e=>update('phone',e.target.value)} required autoComplete="tel"/></label></div><label>ID Number / Company Registration Number<input value={form.identity_number} onChange={e=>update('identity_number',e.target.value)} required autoComplete="off"/><small className="field-help">A 13-digit number is treated as an ID Number. Other formats are treated as a Company Registration Number.</small></label><label>Password<div className="password-field"><input type={showPassword?'text':'password'} value={form.password} onChange={e=>update('password',e.target.value)} required minLength={8} autoComplete="new-password"/><button type="button" onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label><div className="document-grid"><label className="upload-box"><span><Upload size={18}/> ID Copy</span><small>{idCopy?idCopy.name:'PDF, JPG or PNG · max 7 MB'}</small><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>setIdCopy(e.target.files?.[0]||null)} required/></label><label className="upload-box"><span><Upload size={18}/> Proof Of Address</span><small>{proofOfAddress?proofOfAddress.name:'PDF, JPG or PNG · max 7 MB'}</small><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>setProofOfAddress(e.target.files?.[0]||null)} required/></label></div>{error&&<div className="auth-error">{error}</div>}{notice&&<div className="auth-notice">{notice}</div>}<button className="auth-primary" disabled={busy}>{busy?'Submitting…':'Create account and submit for approval'}</button></form><small className="account-note">Your documents are private and are only for account verification and approval.</small><div className="auth-switch">Already have an account? <button onClick={()=>go('signin')}>Sign in</button></div></div></div>;
}
