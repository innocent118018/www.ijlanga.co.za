# Cloudflare Build Configuration

The repository is prepared to use Vite environment variables. Cloudflare Workers build settings still need to be updated by an account with build-configuration write permission.

Add these production variables:

- VITE_SUPABASE_URL = https://pyhcmceyhrulkwzedwgf.supabase.co
- VITE_SUPABASE_ANON_KEY = the Supabase publishable/anon key

Then trigger a production deployment by pushing a commit or starting a new build.

The VITE_SUPABASE_ANON_KEY is a browser publishable key, not a service-role secret. Never place service-role, payment, OAuth refresh-token or Meta secrets in VITE_ variables.

For server-side integrations use Supabase Edge Function secrets or the Node.js server runtime.
