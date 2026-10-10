# ADR-005: Custom JWT Authentication

**Status:** Accepted
**Date:** 2026-10-04

## Decision

Authentication uses custom JWT implementation with short-lived access tokens (15 min) and rotated refresh tokens (7 days). Passwords are hashed with Argon2id. No external authentication provider is used for the pilot.

To prevent stale authorizations when users are deactivated, roles are changed, or sessions are revoked, each user record maintains an integer `auth_version` (default 1). The access token payload embeds `auth_version`. Server-side middleware (cached in Redis with 30s TTL, cache explicitly invalidated on increment) compares the token's `auth_version` against the user's current DB record. Any deactivation, role downgrade, or forced logout increments `auth_version`, rendering all existing access tokens immediately invalid. **Fail-closed**: if Redis is unreachable and the DB lookup fails, the request is rejected with 401.

**JWT signing algorithm**: RS256 only. No algorithm negotiation or fallback to HS256. PyJWT is the sole JWT library.

## Alternatives Considered

1. **Custom JWT with auth_version check** — Self-managed tokens, password hashing, version-based immediate revocation
2. **Auth0 / Firebase Auth** — Managed authentication service
3. **Keycloak** — Self-hosted identity provider
4. **Django-style session auth** — Server-side sessions with cookies
5. **Pure stateless JWT (no revocation)** — Rejected because deactivating an employee or changing permissions would allow continued access until the 15-minute token expires.

## Rationale

- No dependency on external services — keeps user credentials within DSA-controlled infrastructure
- Auth0/Firebase would send authentication data to external services, conflicting with data control principles
- Keycloak adds significant operational complexity for a pilot with a small user base
- Session auth doesn't work well with mobile browsers and API-first architecture
- JWT enables stateless API calls with embedded claims, while `auth_version` provides instantaneous server-side revocation on administrative events
- Refresh token rotation provides security against token theft
- Argon2id is the current best practice for password hashing
- Upgrade path to OAuth2/OIDC exists if SSO is needed later

## Consequences

- JWT secret management is critical — stored in environment variables or secret manager
- Token refresh logic must be implemented in the frontend API client
- Token payload includes `user_id`, `org_id`, `role`, and `auth_version`
- Any administrative deactivation, role change, or security logout increments `users.auth_version` and invalidates refresh tokens
- API authentication dependency checks `auth_version` efficiently
- Account lockout logic is custom (not delegated to a provider)
- 2FA (TOTP) must be implemented custom (P1)
- No SSO in the pilot release
