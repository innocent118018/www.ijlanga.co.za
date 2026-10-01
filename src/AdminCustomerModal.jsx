import React,{useState}from'react';
import{UserPlus,X}from'lucide-react';
import'./admin-crm.css';

const emptyForm={company_name:'',contact_name:'',email:'',phone:'',notes:''};

export default function AdminCustomerModal({busy,error,onClose,onSave}){
 const[form,setForm]=useState(emptyForm);
 function update(field,value){setForm(current=>({...current,[field]:value}))}
 async function submit(event){
  event.preventDefault();
  await onSave({
   company_name:form.company_name.trim()||null,
   contact_name:form.contact_name.trim(),
   email:form.email.trim(),
   phone:form.phone.trim()||null,
   notes:form.notes.trim()||null
  });
 }
 return <div className="admin-modal" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}><form className="admin-form admin-customer-form" role="dialog" aria-modal="true" aria-labelledby="customer-form-title" onSubmit={submit}>
  <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={busy}><X size={18}/></button>
  <span className="eyebrow">CUSTOMER DIRECTORY</span><h2 id="customer-form-title">Add customer</h2>
  <label>Company name<input value={form.company_name} onChange={event=>update('company_name',event.target.value)} autoComplete="organization"/></label>
  <label>Contact name<input value={form.contact_name} onChange={event=>update('contact_name',event.target.value)} autoComplete="name" required/></label>
  <label>Email address<input type="email" value={form.email} onChange={event=>update('email',event.target.value)} autoComplete="email"/></label>
  <label>Phone<input type="tel" value={form.phone} onChange={event=>update('phone',event.target.value)} autoComplete="tel"/></label>
    <label>Notes / address<textarea rows="4" value={form.notes} onChange={event=>update('notes',event.target.value)}/></label>
    {error&&<div className="admin-error" role="alert">{error}</div>}
  <div className="admin-top-actions"><button type="button" className="admin-btn ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="admin-btn" disabled={busy||!form.contact_name.trim()}><UserPlus size={16}/>{busy?'Adding…':'Add customer'}</button></div>
 </form></div>;
}
