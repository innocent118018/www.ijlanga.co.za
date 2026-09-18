# SDK Strategy

## Node.js
Primary adapter/orchestration layer. Use native fetch where practical. Provider adapters should expose small contracts such as createPayment, verifyWebhook, searchCompany, syncAccounting, listReviews and sendMessage.

## Rust
Use Rust for typed workers, high-concurrency jobs and data processing. Prototype dependencies: reqwest, serde, serde_json, thiserror and hmac/sha2 for signatures.

## Kotlin
Use Kotlin for Android/JVM clients. Use coroutines, kotlinx.serialization and Ktor. Kotlin clients call the IJ Langa API; provider secrets remain in Node.js.

## GraphQL
Expose a stable internal GraphQL contract so browser, Rust and Kotlin clients do not depend directly on provider-specific APIs.

## Webhooks
Authenticate/signature-check, record an idempotency key, persist the event, update state, enqueue notification work, then return quickly.
