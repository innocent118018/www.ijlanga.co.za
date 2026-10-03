# Cloudflare Build Configuration

Cloudflare Workers Builds is already connected to this GitHub repository for the `www-ijlanga-co-za` service. GitHub receives a `Workers Builds` check when commits are pushed. Use that native integration; do not add a separate Pages deploy workflow.

Production and Preview builds use `npm run build`; Wrangler deploys production with `npx wrangler deploy` and creates feature-branch previews with `npx wrangler preview`. The committed `wrangler.jsonc` configures the Worker to serve the Vite `dist` output with SPA fallback.

Configure these build variables in the Worker build settings for both Production and Previews:

- VITE_SUPABASE_URL = https://pyhcmceyhrulkwzedwgf.supabase.co
- VITE_SUPABASE_ANON_KEY = the Supabase publishable/anon key

The `VITE_SUPABASE_ANON_KEY` is a browser publishable key, not a service-role secret. Never place service-role, payment, OAuth refresh-token or Meta secrets in `VITE_` variables. A Cloudflare account administrator must enter these values in the existing Worker build settings; they are not GitHub Actions secrets.

For server-side integrations use Supabase Edge Function secrets or the Node.js server runtime.
