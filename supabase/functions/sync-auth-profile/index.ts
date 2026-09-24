import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const audit=async(db:any,p:any)=>{try{await db.from("audit_logs").insert({...p,created_at:new Date().toISOString()})}catch(e){console.warn("audit log failed",e)}};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"POST required."},405);
 try{
  const auth=req.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return json({error:"Authentication required."},401);
  const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,publicKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
  const client=createClient(url,publicKey,{global:{headers:{Authorization:auth}}});const {data:{user},error:ue}=await client.auth.getUser();if(ue||!user)return json({error:"Authenticated user could not be verified."},401);
  const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});const now=new Date().toISOString();
  let {data:profile,error:pe}=await db.from("profiles").select("email,first_name,last_name,surname,full_name,phone,id_number,company_registration_number,role,is_active,approval_status,account_state").eq("id",user.id).maybeSingle();if(pe)throw pe;
  let repaired=false;
  if(!profile){const m=user.user_metadata||{};const first=String(m.first_name||"").trim(),last=String(m.last_name||"").trim(),surname=String(m.surname||"").trim();const payload={id:user.id,email:user.email,first_name:first||null,last_name:last||null,surname:surname||null,full_name:String(m.full_name||[first,last,surname].filter(Boolean).join(" ")||user.email||"User"),phone:String(m.phone||user.phone||"").trim()||null,id_number:m.id_number?String(m.id_number):null,company_registration_number:m.company_registration_number?String(m.company_registration_number):null,role:"client",is_active:false,approval_status:"pending",account_state:"EMAIL_VERIFIED",email_verified_at:now,updated_at:now};const {error}=await db.from("profiles").upsert(payload,{onConflict:"id"});if(error)throw error;profile=payload;repaired=true}else{const state=profile.approval_status==="approved"?"APPROVED":"ADMIN_PENDING";const {error}=await db.from("profiles").update({email_verified_at:now,account_state:state,updated_at:now}).eq("id",user.id);if(error)throw error;profile.email_verified_at=now;profile.account_state=state}
  const {error:ae}=await db.auth.admin.updateUserById(user.id,{phone:profile.phone||undefined,user_metadata:{...(user.user_metadata||{}),first_name:profile.first_name||"",last_name:profile.last_name||"",surname:profile.surname||"",full_name:profile.full_name||"",phone:profile.phone||"",id_number:profile.id_number||null,company_registration_number:profile.company_registration_number||null}});if(ae)throw ae;
  await audit(db,{actor_user_id:user.id,action:"email_verified",resource_type:"profiles",resource_id:user.id,new_value:{email_verified_at:profile.email_verified_at,account_state:profile.account_state},result:"success"});return json({ok:true,profile_repaired:repaired,account_state:profile.account_state});
 }catch(e:any){return json({error:e?.message||"Could not synchronize account profile."},500)}
});
