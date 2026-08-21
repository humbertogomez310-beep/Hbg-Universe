---
name: HBG Core execution
description: Durable rule for routing real actions between independent HBG applications.
---

HBG CORE is the only action boundary between independent applications. App capabilities register handlers while mounted; commands targeting a closed app remain pending until that app mounts, then resolve with the real execution result.

**Why:** Keeping the router in the core avoids duplicate global state and prevents TERMINADOR from claiming success when a target engine is unavailable or playback failed.

**How to apply:** Add new cross-app behavior as a typed HBG action and register it in the owning module. Return `success`, optional `data`, and an explicit `error`; never simulate completion in the caller.