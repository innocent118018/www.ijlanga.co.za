import React,{useEffect,useState}from'react';
import{FilePlus2,Plus,Trash2,X}from'lucide-react';
import{supabase}from'./lib/supabase';
import'./admin-crm.css';

const money=n=>`R ${Number(n||0).toLocaleString('en-ZA',{minimumFractionDigits:2})}`;
const newLine=()=>({id:crypto.randomUUID(),product_id:null,sku:'',product_name:'',quantity:1,unit_price:''});

export default function AdminQuoteModal({customers,busy,error,onClose,onSave}){
 const[products,setProducts]=useState([]),[loading,setLoading]=useState(true),[catalogError,setCatalogError]=useState('');
 const[customerId,setCustomerId]=useState(''),[selectedProduct,setSelectedProduct]=useState(''),[notes,setNotes]=useState(''),[items,setItems]=useState([]);
 useEffect(()=>{let mounted=true;(async()=>{const{data,error:e}=await supabase.from('products').select('id,sku,name,category,price,price_label').eq('is_active',true).order('category').order('name');if(!mounted)return;if(e)setCatalogError(e.message);else{setProducts(data||[]);setSelectedProduct(data?.[0]?.id||'')}setLoading(false)})();return()=>{mounted=false}},[]);
 function addService(){const product=products.find(item=>item.id===selectedProduct);if(!product)return;setItems(current=>[...current,{id:crypto.randomUUID(),product_id:product.id,sku:product.sku,product_name:product.name,quantity:1,unit_price:product.price??''}])}
 function addCustomLine(){setItems(current=>[...current,newLine()])}
 function updateItem(id,field,value){setItems(current=>current.map(item=>item.id===id?{...item,[field]:value}:item))}
 function removeItem(id){setItems(current=>current.filter(item=>item.id!==id))}
 async function submit(event){event.preventDefault();await onSave({customer_id:customerId,notes:notes.trim()||null,items:items.map(({product_id,sku,product_name,quantity,unit_price})=>({product_id,sku,product_name,quantity:Number(quantity),unit_price:unit_price===''?null:Number(unit_price)}))})}
 const subtotal=items.reduce((sum,item)=>{const product=products.find(candidate=>candidate.id===item.product_id);return sum+(Number(product?.price??item.unit_price)||0)*(Number(item.quantity)||0)},0);
 const ready=Boolean(customerId&&items.length&&items.every(item=>{const quantity=Number(item.quantity),product=products.find(candidate=>candidate.id===item.product_id),hasPrice=product?.price!==null&&product?.price!==undefined||(item.unit_price!==''&&Number.isFinite(Number(item.unit_price))&&Number(item.unit_price)>=0);return Number.isInteger(quantity)&&quantity>=1&&quantity<=100&&(product||item.product_name.trim())&&hasPrice}));
 return <div className="admin-modal" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}><form className="admin-form admin-quote-form" role="dialog" aria-modal="true" aria-labelledby="quote-form-title" onSubmit={submit}>
  <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={busy}><X size={18}/></button>
  <span className="eyebrow">QUOTE MANAGEMENT</span><h2 id="quote-form-title">Create quote</h2>
  <label>Customer<select required value={customerId} onChange={event=>setCustomerId(event.target.value)}><option value="">Select a customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.company_name||customer.contact_name} · {customer.email||'No email'}</option>)}</select></label>
  <div className="admin-quote-add-line"><label>Service<select value={selectedProduct} onChange={event=>setSelectedProduct(event.target.value)} disabled={loading||!products.length}><option value="">Select an active service</option>{products.map(product=><option key={product.id} value={product.id}>{product.name} · {product.price===null?'Price on request':money(product.price)}</option>)}</select></label><button type="button" className="admin-btn ghost" onClick={addService} disabled={!selectedProduct}><Plus size={16}/> Add service</button><button type="button" className="admin-btn ghost" onClick={addCustomLine}><Plus size={16}/> Custom line</button></div>
  {catalogError&&<div className="admin-error" role="alert">{catalogError}</div>}
  <div className="admin-quote-lines">{items.map(item=>{const product=products.find(candidate=>candidate.id===item.product_id);const fixedPrice=product?.price!==null&&product?.price!==undefined;return <div className="admin-quote-line" key={item.id}>
   <label>{item.product_id?'Service':'Description'}{item.product_id?<input value={item.product_name} readOnly/>:<input value={item.product_name} onChange={event=>updateItem(item.id,'product_name',event.target.value)} required/>}</label>
   <label>Qty<input type="number" min="1" max="100" step="1" value={item.quantity} onChange={event=>updateItem(item.id,'quantity',event.target.value)} required/></label>
   <label>{fixedPrice?'Unit price':'Unit price (excl. VAT)'}<input type="number" min="0" step="0.01" value={fixedPrice?product.price:item.unit_price} onChange={event=>updateItem(item.id,'unit_price',event.target.value)} readOnly={fixedPrice} required={!fixedPrice}/></label>
   <button type="button" className="icon-action" title="Remove line" aria-label="Remove line" onClick={()=>removeItem(item.id)}><Trash2 size={16}/></button>
  </div>})}</div>
  {items.length>0&&<div className="admin-quote-total"><span>Subtotal excl. VAT</span><strong>{money(subtotal)}</strong></div>}
  <label>Notes<textarea rows="3" value={notes} onChange={event=>setNotes(event.target.value)}/></label>
  {error&&<div className="admin-error" role="alert">{error}</div>}
  <div className="admin-top-actions"><button type="button" className="admin-btn ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="admin-btn" disabled={busy||loading||!ready}><FilePlus2 size={16}/>{busy?'Creating…':'Create draft quote'}</button></div>
 </form></div>;
}
