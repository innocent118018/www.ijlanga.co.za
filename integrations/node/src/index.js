import crypto from 'node:crypto';

export class IjLangaError extends Error {}

export function hmacSha256Hex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

export class IkhokhaClient {
  constructor({ baseUrl='https://api.ikhokha.com/public-api/v1/api', appId, appSecret }) {
    this.baseUrl=baseUrl; this.appId=appId; this.appSecret=appSecret;
  }
  async createPayment(payload) {
    const body=JSON.stringify(payload);
    const path=new URL(this.baseUrl).pathname + '/payment';
    const signature=hmacSha256Hex(this.appSecret, path+body);
    const r=await fetch(this.baseUrl+'/payment',{method:'POST',headers:{'Content-Type':'application/json','ik-appid':this.appId,'ik-sign':signature},body});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new IjLangaError(data.message||'iKhokha payment request failed');
    return data;
  }
}

export class PayfastClient {
  constructor({ processUrl='https://www.payfast.co.za/eng/process', merchantId, merchantKey, passphrase='' }) {
    this.processUrl=processUrl; this.merchantId=merchantId; this.merchantKey=merchantKey; this.passphrase=passphrase;
  }
  buildCheckout(fields) {
    const data={merchant_id:this.merchantId,merchant_key:this.merchantKey,...fields};
    const ordered=Object.entries(data).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>k+'='+encodeURIComponent(String(v).trim()).replace(/%20/g,'+')).join('&');
    data.signature=md5(this.passphrase ? ordered+'&passphrase='+encodeURIComponent(this.passphrase).replace(/%20/g,'+') : ordered);
    return { action:this.processUrl, fields:data };
  }
}

export class CipcClient {
  constructor({ baseUrl='https://developer.cipc.co.za', accessToken }) { this.baseUrl=baseUrl; this.accessToken=accessToken; }
  async request(path, options={}) {
    const r=await fetch(this.baseUrl+path,{...options,headers:{Authorization:'Bearer '+this.accessToken,Accept:'application/json',...(options.headers||{})}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new IjLangaError(data.message||'CIPC request failed');
    return data;
  }
}

export class ManagerClient {
  constructor({ baseUrl, apiKey }) { this.baseUrl=baseUrl.replace(/\/$/,'')+'/api'; this.apiKey=apiKey; }
  async request(path, options={}) {
    const r=await fetch(this.baseUrl+path,{...options,headers:{Accept:'application/json',Authorization:'Bearer '+this.apiKey,...(options.headers||{})}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new IjLangaError(data.message||'Manager request failed');
    return data;
  }
}

export class GoogleBusinessProfileClient {
  constructor({ accessToken }) { this.accessToken=accessToken; this.baseUrl='https://mybusiness.googleapis.com'; }
  async listReviews(accountId, locationId, pageSize=50) {
    const u=this.baseUrl+'/v4/accounts/'+accountId+'/locations/'+locationId+'/reviews?pageSize='+pageSize;
    const r=await fetch(u,{headers:{Authorization:'Bearer '+this.accessToken}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new IjLangaError(data.error?.message||'Google Business Profile request failed');
    return data;
  }
}

export class MetaGraphClient {
  constructor({ accessToken, version='v23.0' }) { this.accessToken=accessToken; this.baseUrl='https://graph.facebook.com/'+version; }
  async request(path, options={}) {
    const separator=path.includes('?')?'&':'?';
    const r=await fetch(this.baseUrl+path+separator+'access_token='+encodeURIComponent(this.accessToken),options);
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new IjLangaError(data.error?.message||'Meta Graph request failed');
    return data;
  }
}

export class WhatsAppClient extends MetaGraphClient {
  async sendText(phoneNumberId, to, body) {
    return this.request('/'+phoneNumberId+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body}})});
  }
}

export async function graphqlRequest({ url, query, variables={}, token }) {
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({query,variables})});
  const data=await r.json();
  if(!r.ok||data.errors) throw new IjLangaError(data.errors?.[0]?.message||'GraphQL request failed');
  return data.data;
}

export function verifyWebhookSignature({ rawBody, signature, secret }) {
  const expected=hmacSha256Hex(secret, rawBody);
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature||''));
}
