# IJ Langa Node.js Integration SDK

Node.js is the primary server-side integration layer for IJ Langa Consulting.

## Providers

- iKhokha / iK Pay
- Payfast
- CIPC
- Manager.io
- Google Business Profile
- Meta Graph
- WhatsApp Cloud API
- GraphQL
- Webhook signature verification

The adapters are dependency-light so they can run in a Node.js server, worker, or trusted integration service.

## Security

Provider credentials must stay server-side. Never put payment secrets, OAuth refresh tokens, Meta tokens, or webhook secrets in `VITE_*` variables.

## Local verification

Run:

```bash
npm test
```

The test suite uses Node's built-in test runner and does not require third-party packages.
