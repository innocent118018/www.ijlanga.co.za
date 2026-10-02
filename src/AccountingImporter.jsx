import React,{useState}from"react";
import{supabase}from"./lib/supabase";

export default function AccountingImporter(){
 const[file,setFile]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[dragging,setDragging]=useState(false);
 function choose(next){setError("");setResult(null);setFile(next||null)}
 async function extract(){
  if(!file)return;
  setBusy(true);setError("");setResult(null);
  try{
   const{data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error("Please sign in again before processing a document.");
   const form=new FormData();form.append("image",file);
   const response=await fetch("/api/accounting/extract",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},body:form});
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||"Extraction request failed.");
   setResult(body);
  }catch(e){setError(e.message||"Could not process this image.");}
  finally{setBusy(false);}
 }
 const supported=["image/jpeg","image/png","image/webp"].includes(file?.type);
 return <section className="admin-card" style={{maxWidth:1000,margin:"0 auto"}}>
  <div className="card-head"><div><span className="eyebrow">CLOUD ACCOUNTING</span><h2>Live Accounting Importer</h2><p>Upload a document image to preview AI extraction. Nothing is saved or posted yet.</p></div></div>
  <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);choose(e.dataTransfer.files?.[0])}} style={{border:"2px dashed "+(dragging?"#0b8068":"#9aa8b7"),background:dragging?"#eef8f5":"#f8fafc",borderRadius:14,padding:28,textAlign:"center"}}>
   <div style={{fontSize:28,marginBottom:8}}>⇧</div><strong>Drag and drop an image here</strong><p style={{margin:"8px 0 14px",color:"#5b6573"}}>JPEG, PNG or WebP · up to 8 MB</p>
   <label className="admin-btn ghost" style={{display:"inline-flex",cursor:"pointer"}}>Choose image<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>choose(e.target.files?.[0])}/></label>
  </div>
  {file&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:14,flexWrap:"wrap"}}><div><strong>{file.name}</strong><small style={{display:"block",color:"#667085"}}>{(file.size/1024/1024).toFixed(2)} MB</small></div><div style={{display:"flex",gap:8}}><button className="admin-btn ghost" onClick={()=>choose(null)} disabled={busy}>Remove</button><button className="admin-btn" onClick={extract} disabled={busy||!supported}>{busy?"Extracting…":"Extract image"}</button></div></div>}
  {file&&!supported&&<p className="admin-error">This endpoint currently accepts image files only. PDF, Excel, CSV and other formats are not enabled yet.</p>}
  {error&&<div className="admin-error" role="alert" style={{marginTop:14}}>{error}</div>}
  {result&&<div style={{marginTop:18}}><div className="admin-notice">Extraction received — manual review required. Verify every value against the source.</div><pre style={{whiteSpace:"pre-wrap",overflowX:"auto",padding:16,background:"#101828",color:"#e6edf5",borderRadius:10,fontSize:12,marginTop:12}}>{JSON.stringify(result.extracted??result,null,2)}</pre></div>}
  <p style={{fontSize:12,color:"#667085",marginTop:16}}>Current stage: image extraction preview only. Source-file storage, page tracking, transaction review, billing and ledger posting will be added in later stages.</p>
 </section>
}
