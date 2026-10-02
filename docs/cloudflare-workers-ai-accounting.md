# Cloudflare Workers AI accounting extraction

This repository uses a Cloudflare Pages Function at `/api/accounting/extract` for image-based extraction. It does not call Google Cloud.

## Required Pages settings

In Cloudflare Dashboard:

1. Open **Workers & Pages** and select the Pages project serving this website.
2. Open **Settings → Functions → Bindings**.
3. Add a Workers AI binding named **AI** and select the available AI resource.
4. Add these environment variables for the relevant deployment environments:
   - `SUPABASE_URL`: the Supabase project URL.
   - `SUPABASE_ANON_KEY`: the Supabase publishable/anon key (never the service-role key).
5. Redeploy the Pages project after changing bindings or variables.

The function requires a valid Supabase access token in the request's Bearer authorization header. It does not write to Supabase and does not post accounting entries.

## Request

Send a multipart form request with an `image` file (JPEG, PNG, or WebP; max 8 MiB) and the current user's Supabase access token:

```js
const form = new FormData();
form.append("image", file);

const response = await fetch("/api/accounting/extract", {
  method: "POST",
  headers: { Authorization: `Bearer ${session.access_token}` },
  body: form,
});
const result = await response.json();
```

The function currently uses `@cf/llava-hf/llava-1.5-7b-hf` and returns extracted JSON when the model response can be parsed, plus the raw response for manual review. Treat all output as unverified.

## Current scope and limitations

- This endpoint processes one image per request. It is not yet the complete upload/import workflow.
- PDF rendering, PDF text extraction, spreadsheets, CSV, XML, JSON, page manifests, resumable jobs, billing, exemptions, and ledger posting are not implemented by this endpoint.
- The model may omit, misread, or hallucinate values. The response explicitly requires human review.
- The function does not implement per-user quotas. Before public production use, add server-side rate limiting and a usage/billing control.
- Keep the source file in the private Supabase storage flow; do not expose it through public URLs.
