import crypto from 'node:crypto';

export class IjLangaError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.name = 'IjLangaError';
    this.status = status;
    this.details = details;
  }
}

export function hmacSha256Hex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

export function safeEqualText(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export class IkhokhaClient {
  constructor({ baseUrl='https://api.ikhokha.com/public-api/v1/api', appId, appSecret }) {
    if (!appId || !appSecret) throw new IjLangaError('iKhokha App ID and App Secret are required');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.appId = appId;
    this.appSecret = appSecret;
  }

  async createPayment(payload) {
    const url = new URL(this.baseUrl + '/payment');
    const body = JSON.stringify(payload);
    const signature = hmacSha256Hex(this.appSecret, url.pathname + body);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ik-appid': this.appId,
        'ik-sign': signature
      },
      body
    });
    const data = await readResponse(response);
    if (!response.ok) {
      throw new IjLangaError(data.message || 'iKhokha payment request failed', {status:response.status, details:data});
    }
    return data;
  }
}

export function verifyIkhokhaWebhookSignature({ rawBody, path, signature, appSecret }) {
  return safeEqualText(hmacSha256Hex(appSecret, path + rawBody), signature);
}

export class PayfastClient {
  constructor({ processUrl='https://www.payfast.co.za/eng/process', merchantId, merchantKey, passphrase='' }) {
    if (!merchantId || !merchantKey) throw new IjLangaError('Payfast merchant ID and merchant key are required');
    this.processUrl = processUrl;
    this.merchantId = merchantId;
    this.merchantKey = merchantKey;
    this.passphrase = passphrase;
  }

  buildCheckout(fields) {
    const data = { merchant_id:this.merchantId, merchant_key:this.merchantKey, ...fields };
    const ordered = Object.entries(data)
      .filter(([,value]) => value !== undefined && value !== null && value !== '')
      .map(([key,value]) => key + '=' + encodeURIComponent(String(value).trim()).replace(/%20/g, '+'))
      .join('&');
    data.signature = md5(
      this.passphrase
        ? ordered + '&passphrase=' + encodeURIComponent(this.passphrase).replace(/%20/g, '+')
        : ordered
    );
    return { action:this.processUrl, fields:data };
  }
}

export class CipcClient {
  constructor({ baseUrl='https://developer.cipc.co.za', accessToken }) {
    if (!accessToken) throw new IjLangaError('CIPC access token is required');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.accessToken = accessToken;
  }

  async request(path, options={}) {
    const response = await fetch(this.baseUrl + path, {
      ...options,
      headers: {
        Authorization:'Bearer ' + this.accessToken,
        Accept:'application/json',
        ...(options.headers || {})
      }
    });
    const data = await readResponse(response);
    if (!response.ok) {
      throw new IjLangaError(data.message || 'CIPC request failed', {status:response.status, details:data});
    }
    return data;
  }
}

export class ManagerClient {
  constructor({ baseUrl, apiKey }) {
    if (!baseUrl || !apiKey) throw new IjLangaError('Manager base URL and API key are required');
    this.baseUrl = baseUrl.replace(/\/$/,'') + '/api';
    this.apiKey = apiKey;
  }

  async request(path, options={}) {
    const response = await fetch(this.baseUrl + path, {
      ...options,
      headers:{
        Accept:'application/json',
        Authorization:'Bearer ' + this.apiKey,
        ...(options.headers || {})
      }
    });
    const data = await readResponse(response);
    if (!response.ok) {
      throw new IjLangaError(data.message || 'Manager request failed', {status:response.status, details:data});
    }
    return data;
  }
}

export class GoogleBusinessProfileClient {
  constructor({ accessToken }) {
    if (!accessToken) throw new IjLangaError('Google access token is required');
    this.accessToken = accessToken;
    this.baseUrl = 'https://mybusiness.googleapis.com';
  }

  async listReviews(accountId, locationId, {pageSize=50, pageToken, orderBy}={}) {
    const url = new URL(
      '/v4/accounts/' + encodeURIComponent(accountId) + '/locations/' + encodeURIComponent(locationId) + '/reviews',
      this.baseUrl
    );
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    if (orderBy) url.searchParams.set('orderBy', orderBy);
    const response = await fetch(url, {headers:{Authorization:'Bearer ' + this.accessToken}});
    const data = await readResponse(response);
    if (!response.ok) {
      throw new IjLangaError(data.error?.message || 'Google Business Profile request failed', {status:response.status, details:data});
    }
    return data;
  }
}

export class MetaGraphClient {
  constructor({ accessToken, version='v23.0' }) {
    if (!accessToken) throw new IjLangaError('Meta access token is required');
    this.accessToken = accessToken;
    this.baseUrl = 'https://graph.facebook.com/' + version;
  }

  async request(path, options={}) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(
      this.baseUrl + path + separator + 'access_token=' + encodeURIComponent(this.accessToken),
      options
    );
    const data = await readResponse(response);
    if (!response.ok) {
      throw new IjLangaError(data.error?.message || 'Meta Graph request failed', {status:response.status, details:data});
    }
    return data;
  }
}

export class WhatsAppClient extends MetaGraphClient {
  async sendText(phoneNumberId, to, body) {
    return this.request('/' + encodeURIComponent(phoneNumberId) + '/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        messaging_product:'whatsapp',
        to,
        type:'text',
        text:{body}
      })
    });
  }
}

export async function graphqlRequest({ url, query, variables={}, token }) {
  if (!url || !query) throw new IjLangaError('GraphQL URL and query are required');
  const response = await fetch(url, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      ...(token ? {Authorization:'Bearer ' + token} : {})
    },
    body:JSON.stringify({query,variables})
  });
  const data = await readResponse(response);
  if (!response.ok || data.errors) {
    throw new IjLangaError(data.errors?.[0]?.message || 'GraphQL request failed', {status:response.status, details:data});
  }
  return data.data;
}

export function verifyWebhookSignature({ rawBody, signature, secret, prefix='' }) {
  const supplied = String(signature || '');
  const normalized = prefix && supplied.startsWith(prefix) ? supplied.slice(prefix.length) : supplied;
  return safeEqualText(hmacSha256Hex(secret, rawBody), normalized);
}
