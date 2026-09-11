import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, ik-appid, ik-sign' }
async function hmacHex(body:string,secret:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function safeEqual(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers:cors});
 const rawBody=await req.text(),appId=Deno.env.get('IKHOKHA_APP_ID'),secret=Deno.env.get('IKHOKHA_APP_SECRET');
 const incomingAppId=req.headers.get('ik-appid')||req.headers.get('IK-AppID')||'',incomingSign=req.headers.get('ik-sign')||'';
 if(!appId||!secret||incomingAppId!==appId)return Response.json({error:'Unauthorized'},{status:401,headers:cors});
 const expected=await hmacHex(rawBody,secret);if(!safeEqual(expected.toLowerCase(),incomingSign.toLowerCase()))return Response.json({error:'Invalid signature'},{status:401,headers:cors});
 let payload:Record<string,unknown>;try{payload=JSON.parse(rawBody)}catch{return Response.json({error:'Invalid JSON'},{status:400,headers:cors})}
 const externalReference=String(payload.externalTransactionID||payload.transactionId||''),providerStatus=String(payload.status||'').toUpperCase(),responseCode=String(payload.responseCode||'');
 const successful=providerStatus==='SUCCESS'||responseCode==='00',failed=['FAILED','FAILURE','DECLINED','CANCELLED','EXPIRED'].includes(providerStatus);
 if(!externalReference)return Response.json({received:true},{headers:cors});
 const secretKeysRaw=Deno.env.get('SUPABASE_SECRET_KEYS');const secretKeys=secretKeysRaw?JSON.parse(secretKeysRaw):{};const supabaseSecret=secretKeys.default;if(!supabaseSecret)return Response.json({error:'Supabase secret key is not configured'},{status:500,headers:cors});
 const supabase=createClient(Deno.env.get('SUPABASE_URL')!,supabaseSecret);
 const{data:order}=await supabase.from('orders').select('id,order_number,customer_id,total,payment_status').eq('payment_reference',externalReference).maybeSingle();
 if(!order)return Response.json({received:true,matched:false},{headers:cors});
 const amountCents=Number(payload.amount||payload.amountCents||0),amount=amountCents>100?amountCents/100:amountCents;
 if(amount&&Math.abs(amount-Number(order.total))>.01)return Response.json({error:'Amount mismatch'},{status:400,headers:cors});
 const paymentStatus=successful?'successful':failed?'failed':'pending';
 const{data:payment}=await supabase.from('payments').upsert({order_id:order.id,provider:'ikhokha',reference:externalReference,amount:Number(order.total),status:paymentStatus,provider_transaction_id:String(payload.paylinkID||payload.transactionID||payload.transactionId||'')||null,metadata:payload,updated_at:new Date().toISOString()},{onConflict:'order_id,reference'}).select('id').single();
 await supabase.from('orders').update({payment_status:successful?'paid':failed?'failed':'pending',status:successful?'confirmed':order.payment_status==='paid'?'confirmed':'pending',updated_at:new Date().toISOString()}).eq('id',order.id);
 if(successful){
   const{data:existingInvoice}=await supabase.from('invoices').select('id,invoice_number,total,amount_paid').eq('order_id',order.id).maybeSingle();
   let invoice=existingInvoice;
   if(!invoice){
     const{data:items}=await supabase.from('order_items').select('product_id,sku,product_name,quantity,unit_price').eq('order_id',order.id);
     const subtotal=(items||[]).reduce((s,i)=>s+Number(i.unit_price||0)*Number(i.quantity||0),0),vat=Math.round(subtotal*.15*100)/100,total=subtotal+vat;
     const{data:created}=await supabase.from('invoices').insert({order_id:order.id,customer_id:order.customer_id,status:'issued',subtotal,vat_rate:15,vat_amount:vat,total,amount_paid:0,notes:`Generated from ${order.order_number}`}).select('id,invoice_number,total,amount_paid').single();
     invoice=created;
     if(created&&items?.length)await supabase.from('invoice_items').insert(items.map(i=>({invoice_id:created.id,product_id:i.product_id,sku:i.sku,description:i.product_name,quantity:i.quantity,unit_price:i.unit_price,vat_rate:15})));
   }
   if(invoice&&payment){
     const{data:receipt}=await supabase.from('receipts').select('id').eq('payment_id',payment.id).maybeSingle();
     if(!receipt)await supabase.from('receipts').insert({invoice_id:invoice.id,order_id:order.id,customer_id:order.customer_id,payment_id:payment.id,amount:Number(order.total),payment_method:'iKhokha',payment_reference:externalReference});
     await supabase.from('invoices').update({amount_paid:Math.min(Number(invoice.total),Number(invoice.amount_paid||0)+Number(order.total)),status:'paid',updated_at:new Date().toISOString()}).eq('id',invoice.id);
   }
 }
 return Response.json({received:true,order_id:order.id,payment_status:paymentStatus},{headers:cors});
})
