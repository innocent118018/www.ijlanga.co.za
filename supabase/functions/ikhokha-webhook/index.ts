import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const site=Deno.env.get("SITE_URL")||"https://www.ijlanga.co.za";
const cors={"Access-Control-Allow-Origin":site,"Access-Control-Allow-Headers":"content-type, ik-appid, ik-sign","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const esc=(s:string)=>s.replace(/[\\"']/g,"\\$&").replace(/\u0000/g,"\\0");
async function hmac(s:string,k:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(k.trim()),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const b=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
const equal=(a:string,b:string)=>a.length===b.length&&a.split("").reduce((r,c,i)=>r|(c.charCodeAt(0)^b.charCodeAt(i)),0)===0;
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return out({error:"Method not allowed"},405);
 try{
  const raw=await req.text(),app=Deno.env.get("IKHOKHA_APP_ID"),secret=Deno.env.get("IKHOKHA_APP_SECRET"),inApp=req.headers.get("ik-appid")||req.headers.get("IK-AppID")||"",inSign=req.headers.get("ik-sign")||"";
  if(!app||!secret||inApp!==app)return out({error:"Unauthorized"},401);
  const callback=`${Deno.env.get("SUPABASE_URL")}/functions/v1/ikhokha-webhook`;
  const expected=await hmac(esc(new URL(callback).pathname+raw),secret);
  if(!equal(expected.toLowerCase(),inSign.toLowerCase()))return out({error:"Invalid signature"},401);
  let p:any;try{p=JSON.parse(raw)}catch{return out({error:"Invalid JSON"},400)}
  const ref=String(p.externalTransactionID||p.transactionId||"");if(!ref)return out({received:true});
  let keys:any={};try{keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}")}catch{}
  const key=keys.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!key)return out({error:"Supabase secret key is not configured"},500);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,key);
  const {data:o}=await db.from("orders").select("id,order_number,customer_id,total,payment_status,customer_email").eq("payment_reference",ref).maybeSingle();if(!o)return out({received:true,matched:false});
  const expectedAmount=Math.round(Number(o.total||0)*1.15*100)/100,rawAmount=Number(p.amount??p.amountCents??0),received=rawAmount>100?rawAmount/100:rawAmount;if(received>0&&Math.abs(received-expectedAmount)>.01)return out({error:"Amount mismatch"},400);
  const status=String(p.status||"").toUpperCase(),code=String(p.responseCode||""),ok=status==="SUCCESS"||code==="00",failed=["FAILED","FAILURE","DECLINED","CANCELLED","EXPIRED"].includes(status),ps=ok?"successful":failed?"failed":"pending";
  const providerId=String(p.paylinkID||p.transactionID||p.transactionId||"")||null;
  const {data:old}=await db.from("payments").select("id").eq("order_id",o.id).eq("reference",ref).maybeSingle();let pid=old?.id||null;
  if(pid)await db.from("payments").update({amount:expectedAmount,status:ps,provider_transaction_id:providerId,metadata:p,updated_at:new Date().toISOString()}).eq("id",pid);else{const {data:n}=await db.from("payments").insert({order_id:o.id,provider:"ikhokha",reference:ref,amount:expectedAmount,status:ps,provider_transaction_id:providerId,metadata:p}).select("id").single();pid=n?.id||null}
  await db.from("orders").update({payment_status:ok?"paid":failed?"failed":"pending",status:ok?"confirmed":o.payment_status==="paid"?"confirmed":"pending",updated_at:new Date().toISOString()}).eq("id",o.id);
  if(ok){
   let {data:inv}=await db.from("invoices").select("id,invoice_number,total,amount_paid").eq("order_id",o.id).maybeSingle();
   if(!inv){const {data:items}=await db.from("order_items").select("product_id,sku,product_name,quantity,unit_price").eq("order_id",o.id);const subtotal=(items||[]).reduce((s:any,i:any)=>s+Number(i.unit_price||0)*Number(i.quantity||0),0),vat=Math.round(subtotal*.15*100)/100,total=Math.round((subtotal+vat)*100)/100;const {data:n}=await db.from("invoices").insert({order_id:o.id,customer_id:o.customer_id,status:"issued",subtotal,vat_rate:15,vat_amount:vat,total,amount_paid:0,notes:`Generated from ${o.order_number}`}).select("id,invoice_number,total,amount_paid").single();inv=n;if(n&&items?.length)await db.from("invoice_items").insert(items.map((i:any)=>({invoice_id:n.id,product_id:i.product_id,sku:i.sku,description:i.product_name,quantity:i.quantity,unit_price:i.unit_price,vat_rate:15})))}
   if(inv&&pid){const {data:r}=await db.from("receipts").select("id").eq("payment_id",pid).maybeSingle();if(!r)await db.from("receipts").insert({invoice_id:inv.id,order_id:o.id,customer_id:o.customer_id,payment_id:pid,amount:expectedAmount,payment_method:"iKhokha",payment_reference:ref});await db.from("invoices").update({amount_paid:Number(inv.total||expectedAmount),status:"paid",updated_at:new Date().toISOString()}).eq("id",inv.id)}
  }
  return out({received:true,order_id:o.id,payment_status:ps});
 }catch(e){console.error(e);return out({error:e instanceof Error?e.message:"Webhook processing failed"},500)}
});
