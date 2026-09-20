import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import'./auth-confirm.css';
import{supabase}from'./lib/supabase';

function App(){
 const token=new URLSearchParams(window.location.search).get('token')||'';
 const[state,setState]=useState(token?'checking':'error');
 const[message,setMessage]=useState(token?'Processing the secure administrator activation link…':'This administrator link is missing its token.');
 const[account,setAccount]=useState(null);
 useEffect(()=>{(async()=>{
   if(!token)return;
   try{
     const response=await fetch('https://pyhcmceyhrulkwzedwgf.supabase.co/functions/v1/admin-account-override',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
     const data=await response.json().catch(()=>({}));
     if(!response.ok||data.error)throw new Error(data.error||'Administrator activation failed.');
     setAccount(data);setState('success');setMessage(data.message||'Account activated successfully.');
     setTimeout(()=>{window.location.href='/admin-users.html?override=success'},1200);
   }catch(e){setState('error');setMessage(e?.message||'Administrator activation failed. Contact info@ijlanga.co.za.')}
 })()},[token]);
 return <main className="auth-confirm"><section>
   <div className={'auth-confirm-icon '+state}>{state==='success'?'✓':state==='error'?'!':'…'}</div>
   <span>IJ LANGA CONSULTING</span><h1>{state==='success'?'Account activated':state==='error'?'Activation failed':'Administrator verification'}</h1>
   <p>{message}</p>
   {account&&<div style={{marginTop:20,padding:16,borderRadius:12,background:'#f4f7f9',textAlign:'left'}}><strong>{account.name}</strong><br/><small>{account.email} · {account.role}</small></div>}
   {state==='error'&&<p style={{marginTop:20}}><a href="/admin-users.html">Return to admin user management</a></p>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);