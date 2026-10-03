import React,{useEffect}from'react';
import{X}from'lucide-react';
import'./shelf-review.css';

const sections=[
 ['Business overview','business_overview'],
 ['Historical revenue and EBITDA','historical_financials'],
 ['Current-year performance and forecast','current_year_performance'],
 ['Indicative enterprise and equity value','indicative_valuation'],
 ['Assets and customer base','assets_and_customers'],
 ['Shareholder structure and proposed interest','shareholder_structure'],
 ['Reasons for the proposed sale','sale_rationale'],
 ['Material regulatory, CIPC, SARS, litigation or other matters','material_matters']
];

export default function ShelfReviewViewer({company,review,viewerEmail,onClose}){
 useEffect(()=>{
  function blockCapture(event){
   const key=String(event.key||'').toLowerCase();
   if(event.type==='contextmenu'||event.type==='copy'||event.type==='cut'||event.type==='dragstart'||event.type==='selectstart'||event.key==='PrintScreen'||((event.ctrlKey||event.metaKey)&&['p','s','c','x','u'].includes(key))){event.preventDefault();event.stopPropagation()}
  }
  document.addEventListener('keydown',blockCapture,true);
  document.addEventListener('contextmenu',blockCapture,true);
  document.addEventListener('copy',blockCapture,true);
  document.addEventListener('cut',blockCapture,true);
  document.addEventListener('dragstart',blockCapture,true);
  document.addEventListener('selectstart',blockCapture,true);
  return()=>{document.removeEventListener('keydown',blockCapture,true);document.removeEventListener('contextmenu',blockCapture,true);document.removeEventListener('copy',blockCapture,true);document.removeEventListener('cut',blockCapture,true);document.removeEventListener('dragstart',blockCapture,true);document.removeEventListener('selectstart',blockCapture,true)}
 },[]);
 const watermark=`CONFIDENTIAL · ${viewerEmail||'AUTHORIZED BIDDER'} · ${new Date().toLocaleString('en-ZA')}`;
 return <div className="shelf-review-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="shelf-review-viewer" role="dialog" aria-modal="true" aria-labelledby="shelf-review-title" onContextMenu={event=>event.preventDefault()}>
  <header className="shelf-review-header"><div><span>CONFIDENTIAL BUYER REVIEW</span><h2 id="shelf-review-title">{company}</h2></div><button type="button" aria-label="Close review" onClick={onClose}><X size={20}/></button></header>
  <div className="shelf-review-content" onCopy={event=>event.preventDefault()} onDragStart={event=>event.preventDefault()}>
   {sections.map(([title,key])=><section className="shelf-review-section" key={key}><h3>{title}</h3><p>{review?.[key]?.trim()||'Not provided at this stage.'}</p></section>)}
  </div>
  <div className="shelf-review-watermark" aria-hidden="true">{Array.from({length:18},(_,index)=><span key={index}>{watermark}</span>)}</div>
 </section></div>;
}
