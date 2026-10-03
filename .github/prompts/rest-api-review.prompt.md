---
mode: 'agent'
description: 'Review a REST API for resource design, HTTP semantics, status codes, error handling, consistency, and versioning. Use when auditing an existing API or checking a new design before implementation.'
---

# REST API Review

## Goal
Audit the API for clarity, consistency, and long-term maintainability. Focus on whether clients can understand the API without guessing.

## Inputs
- Endpoint list or route definitions
- Request and response examples
- Authentication and authorization rules
- Versioning strategy
- Current or planned payload schemas

## Procedure
1. Identify the resources in the API.
   - Are URLs based on nouns and resource collections?
   - Are actions hidden inside the path or query string?
2. Check HTTP method usage.
   - Are `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` used according to their standard semantics?
   - Are requests idempotent where they should be?
3. Review URL predictability.
   - Are resource names consistent across endpoints?
   - Are collection names, identifiers, and nested resources organized in a clear pattern?
4. Evaluate status code usage.
   - Do responses correctly reflect success or failure?
   - Are client-facing outcomes clear without custom interpretation?
5. Inspect error contracts.
   - Are errors structured and predictable?
   - Do validation issues point to the relevant fields?
6. Check filtering and refinement patterns.
   - Are query parameters used for optional filtering, sorting, and retrieval customization?
   - Are they avoiding action-based query flags?
7. Review compatibility and evolution.
   - Are additive changes safe?
   - Are breaking changes handled with a clear versioning plan?
8. Confirm consistency across the surface area.
   - Do field names, error shapes, pagination, and response conventions match across endpoints?

## Output Format
Return:
- a short summary of overall API quality
- a list of issues grouped by severity: high, medium, low
- concrete recommendations for each issue
- a suggested standard for resource naming, method semantics, status codes, and errors

## Example Review Summary
- High: `POST /users/delete` should be replaced with `DELETE /users/{id}`
- Medium: inconsistent naming (`customer`, `user`, `customerProfile`)
- Medium: `200 OK` error responses that contain failure payloads
- Low: inconsistent pagination fields across endpoints

## Quality Bar
An API should be easy to learn, easy to integrate, and safe to evolve. If a developer has to guess how a route works, the design needs tightening.
