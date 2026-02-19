## 2024-05-18 - Exposed API Key and Duplicate Auth Logic
**Vulnerability:** The `CredVerseIssuer 3` client exposes `VITE_API_KEY` (which maps to `ISSUER_BOOTSTRAP_API_KEY` or stored API keys) in the client-side code. This key is used for all "authenticated" requests, bypassing true user session management for many operations.
**Learning:** The application seems to rely on a shared secret model for the Issuer dashboard, which is insecure for a production multi-tenant environment.
**Prevention:** Future work should migrate the Issuer client to use a proper JWT-based auth flow (like `apiKeyOrAuthMiddleware` supports) and remove the API key from the client bundle.

**Vulnerability:** Weak password policies were present in both Issuer and Recruiter applications, allowing users to register with trivial passwords.
**Learning:** Authentication logic (including password validation) is duplicated between `CredVerseRecruiter/server/services/auth-service.ts` and `@credverse/shared-auth`.
**Prevention:** Consolidate authentication logic into `@credverse/shared-auth` and ensure all apps consume it to maintain consistent security policies.
