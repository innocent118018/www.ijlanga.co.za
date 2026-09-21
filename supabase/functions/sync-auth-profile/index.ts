import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"POST required."},405);
  try{
    const authHeader=req.headers.get("Authorization")||"";
    if(!authHeader.startsWith("Bearer ")) return json({error:"Authentication required."},401);
    const url=Deno.env.get("SUPABASE_URL")!;
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
    const userClient=createClient(url,publicKey,{global:{headers:{Authorization:authHeader}}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user) return json({error:"Authenticated user could not be verified."},401);

    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    let {data:profile,error:profileError}=await admin.from("profiles")
      .select("email,first_name,last_name,surname,full_name,phone,id_number,company_registration_number,role,is_active,approval_status")
      .eq("id",user.id).maybeSingle();
    if(profileError) return json({error:"Profile lookup failed: "+profileError.message},500);

    // Verification can arrive before the profile trigger has completed. Repair
    // the profile from the trusted Auth metadata instead of failing the link.
    if(!profile){
      const m=user.user_metadata||{};
      const first_name=String(m.first_name||"").trim();
      const last_name=String(m.last_name||"").trim();
      const surname=String(m.surname||"").trim();
      const full_name=String(m.full_name||[first_name,last_name,surname].filter(Boolean).join(" ")||user.email||"User").trim();
      const payload={
        id:user.id,
        email:user.email,
        first_name:first_name||null,
        last_name:last_name||null,
        surname:surname||null,
        full_name,
        phone:String(m.phone||user.phone||"").trim()||null,
        id_number:m.id_number?String(m.id_number):null,
        company_registration_number:m.company_registration_number?String(m.company_registration_number):null,
        role:"client",
        is_active:false,
        approval_status:"pending",
        email_verified_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      };
      const {error:upsertError}=await admin.from("profiles").upsert(payload,{onConflict:"id"});
      if(upsertError) return json({error:"Verified email, but the account profile could not be repaired: "+upsertError.message},500);
      profile=payload;
    }else{
      const {error:verifiedError}=await admin.from("profiles").update({email_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",user.id);
      if(verifiedError) return json({error:"Verified email, but verification could not be recorded: "+verifiedError.message},500);
    }

    const {error:updateError}=await admin.auth.admin.updateUserById(user.id,{
      phone:profile.phone||undefined,
      user_metadata:{
        ...(user.user_metadata||{}),
        first_name:profile.first_name||"",
        last_name:profile.last_name||"",
        surname:profile.surname||"",
        full_name:profile.full_name||"",
        phone:profile.phone||"",
        id_number:profile.id_number||null,
        company_registration_number:profile.company_registration_number||null,
      },
    });
    if(updateError) return json({error:updateError.message},500);
    return json({ok:true,profile_repaired:!r.result.content.includes('profile_repaired')});
  }catch(e){
    return json({error:e?.message||"Could not synchronize account profile."},500);
  }
});
