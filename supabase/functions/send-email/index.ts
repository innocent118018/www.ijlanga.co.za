import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, webhook-id, webhook-signature, webhook-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m] ?? m));

const subjects: Record<string,string> = {
  signup: "Confirm your IJ Langa Consulting account",
  confirmation: "Confirm your IJ Langa Consulting account",
  invite: "You are invited to IJ Langa Consulting",
  magiclink: "Your IJ Langa Consulting sign-in link",
  recovery: "Reset your IJ Langa Consulting password",
  email_change: "Confirm your IJ Langa email address",
  reauthentication: "Verify your IJ Langa Consulting account",
};
const intros: Record<string,string> = {
  signup: "Your IJ Langa Consulting account has been created. Please confirm your email address before signing in.",
  confirmation: "Your IJ Langa Consulting account has been created. Please confirm your email address before signing in.",
  invite: "You have been invited to create an IJ Langa Consulting account. Use the button below to accept the invitation and finish setting your password.",
  magiclink: "Use the secure button below to sign in. This link is one-time use and expires shortly.",
  recovery: "We received a request to reset your IJ Langa Consulting password. Use the button below to choose a new password.",
  email_change: "A request was made to change the email address on your IJ Langa Consulting account. Confirm the change using the button below.",
  reauthentication: "A sensitive account operation requires verification. Use the verification code below.",
};
const buttons: Record<string,string> = {
  signup: "Confirm email", confirmation: "Confirm email", invite: "Accept invitation",
  magiclink: "Sign in securely", recovery: "Reset password", email_change: "Confirm email change",
};

function renderMail(action: string, token: string, url: string, email: string) {
  const subject = subjects[action] || "IJ Langa Consulting account notification";
  const intro = intros[action] || "There is an account action waiting for you.";
  const button = buttons[action] || "Continue";
  const link = url ? `<p style="text-align:center;margin:30px 0"><a href="${esc(url)}" style="display:inline-block;background:#0b2239;color:#fff;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:bold">${button}</a></p><p style="font-size:12px;color:#81909e;line-height:1.6">If the button does not work, copy and paste this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>` : "";
  const code = token ? `<p style="font-size:13px;color:#637487">Your one-time verification code: <strong style="color:#0b2239">${esc(token)}</strong></p>` : "";
  const html = `<html><body style="margin:0;background:#f4f7f9;font-family:Arial,sans-serif;color:#10243a"><div style="max-width:620px;margin:30px auto;background:#fff;border:1px solid #dfe6ed;border-radius:18px;overflow:hidden"><div style="background:#0b2239;padding:26px 30px;color:#fff"><strong style="font-size:18px;letter-spacing:2px">IJ LANGA CONSULTING</strong><div style="font-size:11px;color:#c69b4a;margin-top:6px">ACCOUNTING YOU CAN TRUST</div></div><div style="padding:34px"><h1 style="font-size:25px;margin:0 0 14px;color:#0b2239">${esc(subject)}</h1><p style="line-height:1.7;color:#637487">${esc(intro)}</p>${link}${code}<p style="font-size:11px;color:#9aa7b3;margin-top:28px">This email was sent to ${esc(email)}. If you did not request this action, you can safely ignore this message.</p></div></div></body></html>`;
  const text = `${intro}\n\n${url ? button + ": " + url + "\n" : ""}${token ? "One-time verification code: " + token + "\n" : ""}If you did not request this action, you can safely ignore this message.`;
  return { subject, html, text };
}

async function sendResend(key: string, from: string, to: string, mail: {subject:string,html:string,text:string}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || "Resend rejected the authentication email.");
  return result?.id || null;
}

function verificationUrl(siteUrl: string, redirectTo: string, tokenHash: string, type: string) {
  if (!tokenHash) return "";
  const base = String(siteUrl || "").replace(/\/$/, "");
  const target = redirectTo || siteUrl;
  return `${base}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(target)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: { http_code: 405, message: "Method not allowed" } }, 405);

  try {
    const secret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";
    if (!secret) throw Object.assign(new Error("SEND_EMAIL_HOOK_SECRET is not configured."), { code: 500 });
    const raw = await req.text();
    const wh = new Webhook(secret.replace(/^v1,whsec_/, ""));
    const payload = wh.verify(raw, Object.fromEntries(req.headers)) as any;
    const user = payload?.user || {};
    const e = payload?.email_data || payload?.email || {};
    const action = String(e.email_action_type || "signup");
    const key = Deno.env.get("RESEND_API_KEY") || Deno.env.get("resend");
    const from = Deno.env.get("RESEND_FROM") || "IJ Langa Consulting <no-reply@ijlanga.co.za>";
    if (!key) throw Object.assign(new Error("RESEND_API_KEY is not configured."), { code: 500 });

    const currentEmail = String(user.email || "").trim();
    const newEmail = String(user.new_email || "").trim();
    const siteUrl = String(e.site_url || "https://www.ijlanga.co.za").trim();
    const redirectTo = String(e.redirect_to || siteUrl).trim();
    const token = String(e.token || "");
    const tokenNew = String(e.token_new || "");
    const hash = String(e.token_hash || "");
    const hashNew = String(e.token_hash_new || "");

    if (action === "email_change" && hashNew && hash && currentEmail && newEmail) {
      const currentUrl = verificationUrl(siteUrl, redirectTo, hashNew, "email_change");
      const newUrl = verificationUrl(siteUrl, redirectTo, hash, "email_change");
      await sendResend(key, from, currentEmail, renderMail("email_change", token, currentUrl, currentEmail));
      await sendResend(key, from, newEmail, renderMail("email_change", tokenNew, newUrl, newEmail));
      return json({});
    }

    const email = action === "email_change" ? (newEmail || currentEmail) : currentEmail;
    if (!email) throw Object.assign(new Error("Auth hook payload did not contain a user email."), { code: 400 });
    const effectiveToken = token || tokenNew;
    const effectiveHash = hash || hashNew;
    const type = action === "signup" || action === "confirmation" ? "signup" : action;
    const url = verificationUrl(siteUrl, redirectTo, effectiveHash, type);
    if (!url && !effectiveToken) throw Object.assign(new Error("Auth hook payload did not contain a token."), { code: 400 });

    await sendResend(key, from, email, renderMail(action, effectiveToken, url, email));
    return json({});
  } catch (error: any) {
    const httpCode = Number(error?.code) || 401;
    return json({ error: { http_code: httpCode, message: error?.message || "Authentication email hook failed." } }, httpCode);
  }
});
