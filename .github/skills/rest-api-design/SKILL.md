---
name: rest-api-design
description: 'Design RESTful APIs that are easy to integrate and maintain. Use when defining resources, choosing HTTP methods, handling status codes, structuring errors, filtering query parameters, and versioning APIs.'
user-invocable: true
---

# REST API Design

## When to Use
- You are designing a new API or refining an existing one.
- You need to define resource-based endpoints instead of action-based URLs.
- You want to choose correct HTTP semantics for reads, writes, updates, and deletes.
- You need consistent error handling, validation, pagination, and status-code usage.
- You are planning API evolution without breaking existing consumers.

## Procedure
1. Model the API around resources, not actions.
   - Use nouns like `users`, `orders`, and `products` in the URL.
   - Let HTTP methods describe the action: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
2. Keep resource naming predictable and consistent.
   - Use one naming convention across all endpoints.
   - Prefer a single pluralized collection naming style.
   - Use path segments for resource identity and query parameters for filtering and refinement.
3. Use HTTP methods for their intended semantics.
   - `GET`: retrieve without changing state.
   - `POST`: create a new resource or trigger a non-idempotent action.
   - `PUT`: replace the resource representation.
   - `PATCH`: apply partial updates.
   - `DELETE`: remove a resource.
   - Prefer idempotent operations for retries and network failures where possible.
4. Communicate outcomes with appropriate HTTP status codes.
   - `200` for successful reads
   - `201` for created resources
   - `202` for accepted asynchronous work
   - `204` for successful responses without a body
   - `400` for invalid requests
   - `401` for authentication problems
   - `403` for forbidden actions
   - `404` for missing resources
   - `409` for conflicts
   - `422` for business validation issues
   - `429` for rate limiting
5. Keep errors structured and consistent.
   - Return a predictable error shape with an error code, message, and relevant metadata.
   - Include field-level validation details when appropriate.
   - Do not hide important failure context inside a generic `something went wrong` response.
6. Use query parameters for filtering, sorting, and optional result refinement.
   - Keep path segments focused on resources.
   - Avoid `action=delete` patterns or other URL-based action switches.
7. Plan for versioning and compatibility.
   - Add non-breaking fields when possible.
   - Avoid changing the meaning of existing fields without a versioned strategy.
   - Use a clear, documented versioning model such as URL versioning or header-based versioning.
8. Standardize request and response conventions.
   - Keep JSON field naming consistent.
   - Standardize date formats, pagination shape, and error envelopes.
   - Make one endpoint’s conventions recognizable across the whole API.
9. Treat consistency as a core API feature.
   - A client should be able to infer behavior from one endpoint to the next.
   - Favor clarity and predictability over clever but inconsistent patterns.

## Decision Points
- URL describes an action instead of a resource? → Refactor to use resource nouns with HTTP methods.
- Resource names differ across endpoints (`user`, `customer`, `customerProfile`)? → Standardize naming and use one convention everywhere.
- Updates use mixed methods (`POST`, `PUT`, `PATCH`)? → Align methods to their intended HTTP semantics.
- Errors are generic or inconsistent? → Standardize error payloads and status codes.
- Filters or sorting are encoded in the path? → Move them to query parameters.
- Existing clients may break on schema changes? → Prefer additive changes first and use explicit versioning when needed.

## Completion Checks
- Each endpoint is centered on a resource and uses HTTP methods appropriately.
- Resource names are predictable and consistent throughout the API.
- Status codes clearly communicate success or failure.
- Errors are structured, machine-readable, and actionable.
- Query parameters are used for filtering and refinement, not for hiding operations.
- API changes are designed with compatibility and versioning in mind.
- The same conventions hold across the whole API so new endpoints feel familiar.

## Example Design Pattern

- `GET /users` → list users
- `POST /users` → create a user
- `GET /users/123` → fetch a specific user
- `PUT /users/123` → replace a user
- `PATCH /users/123` → partial update
- `DELETE /users/123` → delete a user
- `GET /orders?status=paid&sort=-createdAt` → filtered and sorted list

## Related Resources
- [API Review Checklist](./references/api-review-checklist.md)

## Quality Bar
A good REST API is not just technically RESTful. It is easy to learn, easy to integrate, and safe to evolve. The best design makes the correct way to use the API obvious without constant documentation lookup.
