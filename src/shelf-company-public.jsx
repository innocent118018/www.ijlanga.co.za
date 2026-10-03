import React,{useEffect,useState}from'react';
import{ArrowLeft,Building2,Clock3,Gavel,LogIn,LogOut,ShieldCheck,FileText}from'lucide-react';
import{supabase}from'./lib/supabase';
import ShelfReviewViewer from'./ShelfReviewViewer';
import'./shelf-company-public.css';

const money=value=>`R ${Number(value||0).toLocaleString('en-ZA',{minimumFractionDigits:2})}`;
const date=value=>value?new Date(value).toLocaleString('en-ZA',{dateStyle:'medium',timeStyle:'short'}):'Not scheduled';

function remaining(end,now){
 if(!end)return 'No closing time set';
 const seconds=Math.max(0,Math.floor((new Date(end).getTime()-now)/1000));
 if(!seconds)return 'Bidding closed';
 const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),secs=seconds%60;
 return `${days?`${days}d `:''}${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')} remaining`;
}

function activeWindow(listing,now){
 const start=listing.auction_start?new Date(listing.auction_start).getTime():0;
 const end=listing.auction_end?new Date(listing.auction_end).getTime():Infinity;
 if(now<start)return 'upcoming';
 if(now>=end)return 'closed';
 return 'open';
}

export default function ShelfCompanyPublic(){
 const[items,setItems]=useState([]),[summaries,setSummaries]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[session,setSession]=useState(null),[amounts,setAmounts]=useState({}),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[now,setNow]=useState(Date.now()),[selectedReview,setSelectedReview]=useState(null),[reviewError,setReviewError]=useState('');
 async function load(initial=false){if(initial)setLoading(true);const{data,error:e}=await supabase.from('shelf_companies').select('id,company_name,registration_number,compliance_status,proposed_amount,auction_start,auction_end,description,industry,province,year_registered,vat_registered,cipc_status').eq('status','published').order('auction_end',{ascending:true,nullsFirst:false});if(e){setError(e.message||'Listings could not be loaded.');if(initial)setLoading(false);return}setError('');setItems(data||[]);if(data?.length){const{data:summary,error:summaryError}=await supabase.rpc('shelf_public_bid_summary',{p_shelf_company_ids:data.map(item=>item.id)});if(!summaryError){setSummaries(Object.fromEntries((summary||[]).map(row=>[row.shelf_company_id,row])))}else setError(summaryError.message||'Bid totals could not be loaded.')}else setSummaries({});if(initial)setLoading(false)}
 useEffect(()=>{let mounted=true;supabase.auth.getSession().then(({data})=>{if(mounted)setSession(data.session)});const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));load(true);const refresh=setInterval(()=>load(false),15000),ticker=setInterval(()=>setNow(Date.now()),1000);return()=>{mounted=false;subscription.unsubscribe();clearInterval(refresh);clearInterval(ticker)}},[]);
 async function submitBid(listing){setBusy(listing.id);setError('');setNotice('');const amount=Number(amounts[listing.id]);if(!Number.isFinite(amount)||amount<=0){setError('Enter a valid bid amount.');setBusy('');return}const summary=summaries[listing.id],minimum=Math.max(Number(listing.proposed_amount)||0,Number(summary?.highest_bid)||0);if(amount<=minimum){setError(`Your bid must be higher than ${money(minimum)}.`);setBusy('');return}const{error:e}=await supabase.rpc('place_shelf_company_bid',{p_shelf_company_id:listing.id,p_amount:amount});if(e)setError(e.message||'Bid could not be submitted.');else{setNotice('Your bid was submitted.');setAmounts(current=>({...current,[listing.id]:''}));await load(false)}setBusy('')}
 async function openReview(listing){setReviewError('');const{data,error:e}=await supabase.from('shelf_company_reviews').select('business_overview,historical_financials,current_year_performance,indicative_valuation,assets_and_customers,shareholder_structure,sale_rationale,material_matters').eq('shelf_company_id',listing.id).maybeSingle();if(e||!data){setReviewError('The buyer review is available to approved client accounts while bidding is open. Sign in with your approved account, or contact IJ Langa Consulting.');return}setSelectedReview({company:listing.company_name,review:data})}
 return <main className="shelf-public-page"><header className="shelf-public-top"><a href="/" className="shelf-public-back"><ArrowLeft size={16}/> Website</a><a href="/shelf-companies" className="shelf-public-brand"><img src="/ijlanga-logo.svg" alt="IJ Langa Consulting"/><span><b>IJ LANGA CONSULTING</b><small>Shelf companies</small></span></a>{session?<button onClick={()=>supabase.auth.signOut()}><LogOut size={15}/> Sign out</button>:<a href="/login"><LogIn size={15}/> Sign in</a>}</header>
  <section className="shelf-public-hero"><span>IJ LANGA COMPANY MARKETPLACE</span><h1>Shelf companies open for bidding</h1><p>Review published listings, see the current bid position and access confidential buyer information with an approved client account.</p></section>
  {notice&&<div className="shelf-public-notice" role="status">{notice}</div>}{error&&<div className="shelf-public-error" role="alert">{error}</div>}{reviewError&&<div className="shelf-public-error" role="alert">{reviewError}</div>}
  {loading&&<div className="shelf-public-state">Loading available companies…</div>}{!loading&&!items.length&&!error&&<div className="shelf-public-state">No shelf companies are currently published.</div>}
  <section className="shelf-public-grid">{items.map(listing=>{const summary=summaries[listing.id],windowState=activeWindow(listing,now),minimum=Math.max(Number(listing.proposed_amount)||0,Number(summary?.highest_bid)||0);return <article className="shelf-public-card" key={listing.id}>
   <header><div><span className="shelf-public-label">SHELF COMPANY</span><h2>{listing.company_name}</h2></div><Building2 size={24}/></header>
   <div className="shelf-public-facts"><div><small>Registration</small><b>{listing.registration_number}</b></div><div><small>Compliance</small><b className={listing.compliance_status==='Compliant'?'is-compliant':''}><ShieldCheck size={14}/>{listing.compliance_status}</b></div><div><small>Proposed amount</small><strong>{money(listing.proposed_amount)}</strong></div><div><small>Current highest bid</small><strong>{summary?.highest_bid?money(summary.highest_bid):'No bids yet'}</strong></div></div>
   <div className="shelf-public-bid-bar"><span><Gavel size={16}/>{summary?.bidder_count||0} unique bidder{Number(summary?.bidder_count||0)===1?'':'s'}</span><b className={`shelf-auction-clock ${windowState}`}><Clock3 size={15}/>{windowState==='upcoming'?`Opens ${date(listing.auction_start)}`:remaining(listing.auction_end,now)}</b></div>
   {listing.description&&<p className="shelf-public-description">{listing.description}</p>}
   <div className="shelf-public-tags"><span>{listing.industry||'Industry not specified'}</span><span>{listing.province||'Province not specified'}</span><span>{listing.year_registered?`Registered ${listing.year_registered}`:'Registration year not specified'}</span><span>{listing.vat_registered?'VAT registered':'VAT status not listed'}</span></div>
   <div className="shelf-review-action"><button type="button" onClick={()=>openReview(listing)} disabled={windowState!=='open'}><FileText size={16}/> View buyer review</button><small>Confidential · approved client access · view-only</small></div>
   {windowState==='open'&&session?<div className="shelf-public-bid-form"><label>Bid amount<input type="number" min={minimum+0.01} step="0.01" placeholder={`More than ${money(minimum)}`} value={amounts[listing.id]||''} onChange={event=>setAmounts(current=>({...current,[listing.id]:event.target.value}))}/></label><button disabled={busy===listing.id} onClick={()=>submitBid(listing)}><Gavel size={15}/>{busy===listing.id?'Submitting…':'Place bid'}</button></div>:windowState==='open'?<a className="shelf-public-signin" href="/login"><LogIn size={15}/> Sign in to bid</a>:null}
  </article>})}</section><footer className="shelf-public-footer">IJ Langa Consulting (Pty) Ltd · Bids and bidder identities are private.</footer>
  {selectedReview&&<ShelfReviewViewer company={selectedReview.company} review={selectedReview.review} viewerEmail={session?.user?.email} onClose={()=>setSelectedReview(null)}/>}
 </main>;
}
