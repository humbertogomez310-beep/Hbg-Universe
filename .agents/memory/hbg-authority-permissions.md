---
name: HBG Authority permission grants
description: Policy for keeping critical development permissions separate from OWNER identity and sessions.
---

`OWNER` identity and a development session are not sufficient by themselves for code modification or command execution. Keep `universe.code.modify`, `authority.core.modify`, and `universe.command.execute` ungranted by role defaults; protected operations must remain deny-by-default until a separate server-side, owner-controlled grant and audit flow exists. Keep Code Tools unmounted and write/delete/execute implementations blocked until that grant path and its guards are independently verified.

**Why:** A default permission attached to the OWNER role creates ambient privilege and can silently enable a later-mounted route; explicit grants must not be inferred from role or natural-language instructions.

**How to apply:** When adding or changing server permissions, inspect role defaults and every route guard together. Require an active owner development session plus an explicit server-side permission grant for critical development operations; never trust client-provided role, permission, approval, or session fields.
