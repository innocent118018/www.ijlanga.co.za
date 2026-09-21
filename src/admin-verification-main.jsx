import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{CheckCircle2,ShieldAlert,LoaderCircle,ArrowRight}from'lucide-react';
import'./auth-confirm.css';

const FN='https://pyhcmceyhrulkwzedwgf.supabase.co/functions/v1/admin-account-override';

function App(){
 const token=new URLSearchParams(window.location.search).get('token')||'';
 const[state,setState]=useState(token?'checking':'error');
 const[message,setMessage]=useState(token?'Checking the secure administrator activation link…':'This administrator activation link is missing or incomplete.');
 const[account,setAccount]=useState(null);
 useEffect(()=>{
  let live=true;
  if(!token)return;
  (async()=>{
   try{
    const response=await fetch(FN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.error)throw new Error(data.error||'Administrator activation failed.');
    if(!live)return;
    setAccount(data);setState('success');setMessage(data.message||'The account has been verified and activated successfully.');
    window.alert('Account activated successfully. The user can now sign in and will be routed to the correct dashboard.');
   }catch(e){
    if(!live)return;
    setState('error');setMessage(e?.message||'Administrator activation failed. Contact info@ijlanga.co.za.');
    window.alert('Administrator activation failed: '+(e?.message||'Unknown error'));
   }
  })();
  return()=>{live=false};
 },[token]);
 return <main className="auth-confirm"><section>
   <div className={'auth-confirm-icon '+state}>{state==='checking'?<LoaderCircle/>:state==='success'?<CheckCircle2/>:<ShieldAlert/>}</div>
   <span>IJ LANGA CONSULTING</span>
   <h1>{state==='success'?'Account activated':state==='error'?'Activation failed':'Administrator verification'}</h1>
   <p>{message}</p>
   {account&&<div style={{marginTop:20,padding:16,borderRadius:12,background:'#f4f7f9',textAlign:'left'}}><strong>{account.name||'Account'}</strong><br/><small>{account.email||''} · {account.role||'client'} · Supabase Auth confirmed · Profile activated</small></div>}
   {state==='success'&&<p style={{marginTop:24}}><a href="/admin.html" style={{display:'inline-flex',alignItems:'center',gap:8}}>Open administrator dashboard <ArrowRight size={16}/></a></p>}
   {state==='error'&&<p style={{marginTop:24}}>Contact <strong>info@ijlanga.co.za</strong> and provide the error shown above.</p>}
 </section></main>
}
createRoot(document.getElementById('root')).render(<App/>);