---
name: Existing OWNER identity recovery
description: Preserve the original OWNER identity when repairing bootstrap access.
---

Only the configured bootstrap credential may recover the existing `owner` row with role `owner`. Never create a replacement OWNER, change its role or credential, or trust client-supplied authority fields. If that row is inactive, reactivate that same row only after the bootstrap credential validates; commit the reactivation audit, login audit, and session together, failing closed on audit or storage errors. Keep production unchanged unless the owner separately authorizes the production operation and deployment.

**Why:** An active-only lookup can hide an existing inactive OWNER, after which a bootstrap fallback may attempt a duplicate username insert and return an authentication-service error.

**How to apply:** Inspect the target environment and existing row first. Restrict automatic recovery to the authorized environment, verify the account remains unique, and never expose credential values or hashes.
