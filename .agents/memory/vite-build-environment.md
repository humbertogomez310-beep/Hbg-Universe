---
name: Vite build environment
description: Keep static Vite builds independent from variables injected only by Replit runtime workflows.
---

For static Vite packages, `PORT` and `BASE_PATH` may be absent during workspace builds even though managed dev workflows provide them at runtime. A missing port must not block a static build; when supplied, validate and use it for the dev/preview server without hardcoding a port.

**Why:** The root build runs package build scripts outside the managed workflow environment, so requiring runtime-only variables prevents otherwise valid production bundles.

**How to apply:** Keep `PORT` optional in Vite configuration and default the root artifact base path only when no `BASE_PATH` is provided. Preserve the workflow-supplied values during development.
