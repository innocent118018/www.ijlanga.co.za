---
mode: 'agent'
description: 'Design a REST API with predictable resource naming, correct HTTP semantics, meaningful status codes, and consistent error handling. Use when creating or refining a new API contract.'
---

# REST API Design

## Goal
Design an API that is easy to understand, simple to integrate, and safe to evolve.

## Inputs
- Domain model and major resources
- Business operations and workflows
- Authentication and authorization needs
- Existing API constraints or legacy routes
- Expected client use cases

## Procedure
1. Define the primary resources.
   - Identify the nouns in the domain.
   - Group them into clear collections and item endpoints.
2. Choose resource naming conventions.
   - Use a single consistent naming pattern everywhere.
   - Prefer nouns over verbs.
   - Keep nested resource structure predictable.
3. Map operations to HTTP methods.
   - `GET` for reading
   - `POST` for creation or non-idempotent actions
   - `PUT` for full replacement
   - `PATCH` for partial update
   - `DELETE` for resource removal
4. Decide the endpoint shape.
   - Paths should identify resources.
   - Query parameters should refine results, not represent actions.
5. Define response semantics.
   - Use standard HTTP success and error codes.
   - Return clear payloads for created, accepted, and failed requests.
6. Standardize error handling.
   - Use a consistent error envelope.
   - Include codes, messages, and field-level validation details.
7. Plan for filtering, sorting, and pagination.
   - Apply the same conventions across all collection endpoints.
8. Design for compatibility.
   - Prefer additive changes.
   - Use explicit versioning for breaking changes.
9. Validate the design against the review checklist.
   - Check resource clarity, method correctness, status code quality, and consistency.

## Output Format
Return:
- a list of resources and collection/item paths
- the HTTP method mapping for each operation
- example responses and status codes
- consistent error payload examples
- query parameter conventions for filtering and pagination
- versioning strategy and compatibility notes

## Example Output
- `GET /users` → list users
- `POST /users` → create user
- `GET /users/{id}` → fetch user
- `PATCH /users/{id}` → update user partially
- `DELETE /users/{id}` → delete user
- `GET /orders?status=paid&sort=-createdAt` → filtered, sorted list

## Quality Bar
The API should make the correct usage obvious without needing extensive documentation. Good REST design is predictable, consistent, and resilient to client changes over time.
