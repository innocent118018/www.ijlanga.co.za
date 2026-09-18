# IJ Langa Integration Architecture

Node.js is the primary integration/orchestration layer. Rust and Kotlin are first-class typed SDK/prototype clients for future workers, Android and JVM services.

## Provider map
- iKhokha / iK Pay: payments and signed webhooks.
- Payfast: checkout, ITN and billing.
- CIPC APIVerse: company search, filing, BO and documents.
- Manager.io: accounting API synchronization.
- Google Business Profile: reviews and profile management.
- WhatsApp Cloud API: customer messaging.
- Meta/Facebook Graph API: pages, leads and messaging workflows.
- GraphQL: stable internal API contract.
- Webhooks: signed, idempotent event ingestion.

CIPC's current APIVerse Hub uses OAuth 2.0 and REST APIs for company, filing, BO, XBRL and document services. Payfast supports custom web/API integration and requires ITN security checks. Manager exposes an API through the site's /api endpoint. Google Business Profile exposes review APIs with OAuth access. 

## Runtime boundary
Browser -> Node.js/API -> provider
Provider -> signed webhook -> Node.js -> Supabase

Provider secrets never go into Vite/browser bundles.

## UX
Mobile-first, keyboard accessible, reduced-motion friendly, skeleton loading, clear Connected / Needs setup / Error states, one primary action per card, and responsive cards that become tables on desktop.
