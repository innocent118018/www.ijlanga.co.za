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
    const {data:profile,error:profileError}=await admin.from("profiles")
      .select("email,first_name,last_name,surname,full_name,phone,id_number,company_registration_number")
      .eq("id",user.id).maybeSingle();
    if(profileError||!profile) return json({error:"Profile not found."},404);

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
    return json({ok:true});
  }catch(e){
    return json({error:e?.message||"Could not synchronize account profile."},500);
  }
});
