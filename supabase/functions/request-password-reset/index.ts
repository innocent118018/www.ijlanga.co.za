import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const SITE="https://www.ijlanga.co.za";
const VERIFY=SITE+"/?account-verification=1";
const DASHBOARD=SITE+"/dashboard.html";

function mailHtml(email:string,link:string,token:string){
  return `<html><body style="margin:0;background:#f4f7f9;font-family:Arial,sans-serif;color:#10243a"><div style="max-width:620px;margin:30px auto;background:#fff;border:1px solid #dfe6ed;border-radius:18px;overflow:hidden"><div style="background:#0b2239;padding:26px 30px;color:#fff"><strong style="font-size:18px;letter-spacing:2px">IJ LANGA CONSULTING</strong><div style="font-size:11px;color:#c69b4a;margin-top:6px">ACCOUNTING YOU CAN TRUST</div></div><div style="padding:34px"><h1 style="font-size:25px;color:#0b2239">Reset your password</h1><p style="line-height:1.7;color:#637487">A password reset was requested for this IJ Langa Consulting account.</p><p style="text-align:center;margin:30px 0"><a href="${link}" style="display:inline-block;background:#0b2239;color:#fff;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:bold">Continue to password reset</a></p><p style="font-size:12px;color:#81909e;line-height:1.6">If the button does not work, copy and paste this link:<br><span style="word-break:break-all">${link}</span></p><p style="font-size:13px;color:#637487">One-time reset code: <strong style="color:#0b2239">${token}</strong></p><p style="font-size:11px;color:#9aa7b3;margin-top:28px">This email was sent to ${email}. If you did not request a password reset, ignore this message.</p></div></div></body></html>`;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"POST required."},405);
  const generic="If an account exists for these details, a password-reset email has been sent. Check your inbox and spam folder.";
  try{
    const {email}=await req.json().catch(()=>({email:""}));
    const normalized=String(email||"").trim().toLowerCase();
    if(!normalized||!normalized.includes("@"))return json({ok:true,message:generic});
    const url=Deno.env.get("SUPABASE_URL")!;
    const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resend=Deno.env.get("RESEND_API_KEY")||Deno.env.get("resend")||"";
    const from=Deno.env.get("RESEND_FROM")||"IJ Langa Consulting <no-reply@ijlanga.co.za>";
    if(!resend)throw new Error("RESEND_API_KEY is not configured.");
    const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data,error}=await admin.auth.admin.generateLink({
      type:"recovery",
      email:normalized,
      options:{redirectTo:DASHBOARD}
    });
    // Keep the public response generic so this endpoint does not disclose account existence.
    if(error||!data?.properties?.hashed_token){
      console.error("password reset generation failed",error?.message||"missing token");
      return json({ok:true,message:generic});
    }
    const tokenHash=data.properties.hashed_token;
    const token=data.properties.email_otp||"";
    const link=VERIFY+"?"+new URLSearchParams({token_hash:tokenHash,type:"recovery",redirect_to:DASHBOARD}).toString();
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json"},
      body:JSON.stringify({
        from,to:[normalized],subject:"Reset your IJ Langa Consulting password",
        html:mailHtml(normalized,link,token),
        text:"Reset your IJ Langa Consulting password: "+link+"\n\nOne-time reset code: "+token
      })
    });
    if(!response.ok){
      const body=await response.text();
      console.error("Resend password reset failed",body);
      return json({ok:true,message:generic});
    }
    return json({ok:true,message:generic});
  }catch(e:any){
    console.error("request-password-reset",e);
    return json({ok:true,message:generic});
  }
});