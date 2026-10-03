# Cloudflare Build Configuration

GitHub Actions builds and deploys this Vite site to the Cloudflare Pages project `www-ijlanga-co-za` on pushes to `main` and `feature/financial-import-payment-workflow`. `main` is the production branch; the feature branch deploys as a Pages preview deployment.

Configure these repository-level Actions variables:

- VITE_SUPABASE_URL = https://pyhcmceyhrulkwzedwgf.supabase.co
- VITE_SUPABASE_ANON_KEY = the Supabase publishable/anon key

Configure these repository Actions secrets:

- CLOUDFLARE_API_TOKEN = a Cloudflare API token with Pages project deployment permission
- CLOUDFLARE_ACCOUNT_ID = the Cloudflare account ID containing `www-ijlanga-co-za`

The workflow checks all four values and stops before deployment if any are missing. The VITE_SUPABASE_ANON_KEY is a browser publishable key, not a service-role secret. Never place service-role, payment, OAuth refresh-token or Meta secrets in VITE_ variables.

For server-side integrations use Supabase Edge Function secrets or the Node.js server runtime.
