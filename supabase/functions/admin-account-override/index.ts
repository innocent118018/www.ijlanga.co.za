import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, apikey, authorization",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const SITE="https://www.ijlanga.co.za";

async function sha256Hex(value:string){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"POST required."},405);
  try{
    const {token}=await req.json().catch(()=>({token:""}));
    if(typeof token!=="string"||token.length<20)return json({error:"The administrator verification link is invalid or incomplete."},400);

    const url=Deno.env.get("SUPABASE_URL")!;
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const tokenHash=await sha256Hex(token);

    const {data:override,error:overrideError}=await admin.from("admin_account_overrides")
      .select("id,request_id,user_id,expires_at,used_at")
      .eq("token_hash",tokenHash)
      .maybeSingle();

    if(overrideError)throw overrideError;
    if(!override)return json({error:"This administrator verification link is invalid or has already been replaced."},400);
    if(override.used_at)return json({error:"This administrator verification link has already been used."},400);
    if(new Date(override.expires_at).getTime()<=Date.now())return json({error:"This administrator verification link has expired. A new administrator link must be issued."},400);

    const {data:profile,error:profileError}=await admin.from("profiles")
      .select("id,email,full_name,first_name,last_name,surname,phone,role,employer_id")
      .eq("id",override.user_id)
      .maybeSingle();
    if(profileError)throw profileError;
    if(!profile)return json({error:"The account profile no longer exists. Contact info@ijlanga.co.za."},404);

    const {data:request,error:requestError}=await admin.from("account_access_requests")
      .select("id,status,admin_approval_status,employer_approval_status,matched_employer_id")
      .eq("id",override.request_id)
      .maybeSingle();
    if(requestError)throw requestError;
    if(!request)return json({error:"The account verification request no longer exists. Contact info@ijlanga.co.za."},404);

    const {error:authError}=await admin.auth.admin.updateUserById(profile.id,{
      email_confirm:true,
      phone_confirm:profile.phone?true:undefined,
      user_metadata:{
        first_name:profile.first_name||"",
        last_name:profile.last_name||"",
        surname:profile.surname||"",
        full_name:profile.full_name||"",
        phone:profile.phone||""
      }
    });
    if(authError)throw new Error("Supabase could not confirm the account: "+authError.message);

    const now=new Date().toISOString();
    const {error:profileUpdateError}=await admin.from("profiles").update({
      is_active:true,
      approval_status:"approved",
      approval_notes:"Activated by authorised IJ Langa administrator through the secure verification override.",
      approved_at:now,
      email_verified_at:now,
      updated_at:now
    }).eq("id",profile.id);
    if(profileUpdateError)throw new Error("Supabase confirmed the account, but the profile could not be activated: "+profileUpdateError.message);

    const {error:requestUpdateError}=await admin.from("account_access_requests").update({
      status:"approved",
      admin_approval_status:"approved",
      admin_reviewed_at:now,
      employer_approval_status:request.matched_employer_id?"approved":request.employer_approval_status,
      employer_reviewed_at:request.matched_employer_id?now:undefined,
      reviewed_at:now,
      notes:"Activated by authorised IJ Langa administrator through the secure email verification override.",
      updated_at:now
    }).eq("id",request.id);
    if(requestUpdateError)throw new Error("The account was activated, but the verification request could not be closed: "+requestUpdateError.message);

    const {error:usedError}=await admin.from("admin_account_overrides").update({used_at:now}).eq("id",override.id).is("used_at",null);
    if(usedError)throw new Error("The account was activated, but the administrator link could not be marked as used: "+usedError.message);

    return json({
      ok:true,
      name:profile.full_name||[profile.first_name,profile.last_name,profile.surname].filter(Boolean).join(" "),
      email:profile.email,
      role:profile.role,
      message:"The account has been verified and activated successfully. The user can now sign in and will be routed to the correct dashboard."
    });
  }catch(e:any){
    console.error("admin-account-override",e);
    return json({error:e?.message||"Administrator activation failed. Contact info@ijlanga.co.za."},500);
  }
});
