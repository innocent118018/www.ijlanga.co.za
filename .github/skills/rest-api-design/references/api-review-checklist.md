# API Review Checklist

Use this checklist when auditing a REST API design.

## 1. Resource Design
- [ ] URLs use nouns/resources instead of action names.
- [ ] Resource names are consistent across endpoints.
- [ ] Collections and item endpoints are predictable.
- [ ] Nested resources follow a clear pattern.

## 2. HTTP Semantics
- [ ] `GET` is used only for read operations.
- [ ] `POST` is used for creation or non-idempotent action triggers.
- [ ] `PUT` is used for replacement semantics when appropriate.
- [ ] `PATCH` is used for partial updates.
- [ ] `DELETE` is used for removal.
- [ ] Idempotent operations are safe to retry.

## 3. Query Parameters
- [ ] Query params filter, sort, and refine resources.
- [ ] Paths do not contain action-like flags.
- [ ] Query parameters do not hide resource operations.

## 4. Status Codes
- [ ] Status codes match the actual result.
- [ ] Success responses use the correct code.
- [ ] Error responses use meaningful HTTP status codes.
- [ ] The client does not need to parse multiple places to understand the result.

## 5. Error Handling
- [ ] Errors follow a consistent structure.
- [ ] Validation issues point to specific fields.
- [ ] Error messages are useful to clients and developers.
- [ ] Generic `something went wrong` responses are avoided.

## 6. Compatibility and Versioning
- [ ] Additive changes are non-breaking when possible.
- [ ] Breaking changes are versioned intentionally.
- [ ] Existing clients have a migration path.

## 7. Consistency
- [ ] JSON field names follow one convention.
- [ ] Date/time and pagination formats are standardized.
- [ ] Response envelopes and errors match the same pattern across endpoints.
- [ ] Developers can infer behavior from one route to the next.

## 8. Final Assessment
- [ ] The API is easy to learn.
- [ ] The API is easy to integrate.
- [ ] The API is easy to maintain.
- [ ] The API can evolve without surprising consumers.

## Example Red Flags
- `GET /getUsers`
- `POST /users/delete`
- inconsistent names such as `user`, `customers`, and `customerProfile`
- response statuses that say `200 OK` while the body describes a failure
- validation errors without field-level detail
- a different pagination format on each endpoint
