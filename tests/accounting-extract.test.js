import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequest } from "../functions/api/accounting/extract.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-key",
  AI: { run: async () => ({ response: '{"document_type":"receipt","transactions":[],"warnings":[]}' }) },
};

test("rejects unauthenticated requests", async () => {
  const request = new Request("https://site.example/api/accounting/extract", { method: "POST" });
  const response = await onRequestPost({ request, env });
  assert.equal(response.status, 401);
});

test("rejects unsupported image types after authentication", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
  try {
    const form = new FormData();
    form.append("image", new File(["data"], "doc.gif", { type: "image/gif" }));
    const request = new Request("https://site.example/api/accounting/extract", {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: form,
    });
    const response = await onRequestPost({ request, env });
    assert.equal(response.status, 415);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns extraction as review-required, not posted", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
  try {
    const form = new FormData();
    form.append("image", new File(["image-bytes"], "receipt.png", { type: "image/png" }));
    const request = new Request("https://site.example/api/accounting/extract", {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: form,
    });
    const response = await onRequestPost({ request, env });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "review_required");
    assert.equal(body.extracted.document_type, "receipt");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects non-POST requests", async () => {
  const response = await onRequest({ request: new Request("https://site.example/api/accounting/extract", { method: "GET" }) });
  assert.equal(response.status, 405);
});
