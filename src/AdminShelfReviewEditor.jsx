import React,{useState}from'react';
import{ClipboardCheck,Save,X}from'lucide-react';
import{supabase}from'./lib/supabase';
import'./shelf-review.css';

const fields=[
 ['Business description and principal activities','business_overview','Describe the business, operating model and principal activities.'],
 ['Historical revenue and EBITDA','historical_financials','Summarise the last 2–3 financial years, including periods and currency.'],
 ['Current-year trading performance / forecast','current_year_performance','Include current-year actuals, forecast assumptions and period covered.'],
 ['Indicative enterprise and equity value','indicative_valuation','Include assumed debt, cash and any valuation basis.'],
 ['Assets and customer base','assets_and_customers','Describe material assets, customer concentration and recurring revenue.'],
 ['Shareholder structure and proposed interest','shareholder_structure','Summarise ownership and the interest proposed to be transferred.'],
 ['Reasons for the proposed sale','sale_rationale','Summarise the stated reasons for sale.'],
 ['Material matters for prospective buyers','material_matters','Include regulatory, CIPC, SARS, litigation or other material matters known at this stage.']
];
const empty=Object.fromEntries(fields.map(([,key])=>[key,'']));

export default function AdminShelfReviewEditor({listing}){
 const[open,setOpen]=useState(false),[form,setForm]=useState(empty),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function show(){setOpen(true);setLoading(true);setError('');setNotice('');const{data,error:e}=await supabase.from('shelf_company_reviews').select('*').eq('shelf_company_id',listing.id).maybeSingle();if(e)setError(e.message);else setForm({...empty,...data});setLoading(false)}
 async function save(event){event.preventDefault();setBusy(true);setError('');const{data:{session}}=await supabase.auth.getSession();const{error:e}=await supabase.from('shelf_company_reviews').upsert({...form,shelf_company_id:listing.id,updated_by:session?.user?.id||null,updated_at:new Date().toISOString()},{onConflict:'shelf_company_id'});if(e)setError(e.message);else setNotice('Buyer review pack saved.');setBusy(false)}
 return <><button type="button" onClick={show}><ClipboardCheck size={14}/> Review pack</button>{open&&<div className="shelf-admin-review-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false)}}><form className="shelf-admin-review" role="dialog" aria-modal="true" aria-labelledby={`review-editor-${listing.id}`} onSubmit={save}><header><div><span>CONFIDENTIAL BUYER REVIEW</span><h2 id={`review-editor-${listing.id}`}>{listing.company_name}</h2></div><button type="button" aria-label="Close review editor" onClick={()=>setOpen(false)} disabled={busy}><X size={19}/></button></header>{loading?<p>Loading review pack…</p>:<div className="shelf-admin-review-fields">{fields.map(([label,key,hint])=><label key={key}>{label}<small>{hint}</small><textarea rows="4" value={form[key]||''} onChange={event=>setForm(current=>({...current,[key]:event.target.value}))}/></label>)}</div>}{error&&<div className="users-error" role="alert">{error}</div>}{notice&&<div className="users-notice" role="status">{notice}</div>}<footer><button type="button" onClick={()=>setOpen(false)} disabled={busy}>Close</button><button type="submit" disabled={busy||loading}><Save size={15}/>{busy?'Saving…':'Save review pack'}</button></footer></form></div>}</>;
}
