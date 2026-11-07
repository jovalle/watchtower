# Watchtower development handoff pack

Prepared 2026-09-27 from `8578769ae3273a5918910b769053d494c56c7ae6`. Research/documentation only: no feature implementation, native build, runtime acceptance or deployment was performed. Both requested worktrees contain the same initial pack so either agent can inspect the other track's interface requirements without relying on uncommitted sibling files.

| Track | Branch and workspace | Read / execute |
| --- | --- | --- |
| Watch Together | `work/watch-together` at `[local workspace]` | [Implementation](watch-together/IMPLEMENTATION.md), [research](watch-together/RESEARCH.md), [agent prompt](watch-together/AGENT-PROMPT.md) |
| Android TV / Google TV | `work/android-tv` at `[local workspace]` | [Implementation](android-tv/IMPLEMENTATION.md), [research](android-tv/RESEARCH.md), [agent prompt](android-tv/AGENT-PROMPT.md) |

Read the [shared contract](shared-contract.md) and [repository audit](repository-audit.md) before either implementation. The user selected **both sideloading and Google Play**; physical device models remain open. All new API paths/schema examples are proposed; no agent may infer they already exist.

Authority order: current user instructions and applicable repository rules, then shared contract plus track implementation checklist, then supporting research alternatives. If technical evidence requires changing a design, update the contract/fixtures and dependent adapters together. Never conceal the change or silently weaken a required acceptance gate.

## What is covered

- Concrete feature matrices with stable IDs, implementation phases and exit gates.
- Current source integration points and missing auth/native/playback capabilities.
- Shared identity, media/time, room ordering, readiness, clock, reconnect and authorization rules.
- Native pairing/profile/session, JSON facade, player/codec, remote/accessibility and platform design.
- Automated, multi-client, real-device, security, performance and release acceptance matrices.
- Operations, migration/rollback considerations and evidence requirements.
- Two copyable execution prompts with explicit subagent ownership and independent review.

## How to start the two agents

1. Open an agent in the assigned existing worktree/branch. Do not create another checkout merely because the agent did not create this one.
2. Paste that track's `AGENT-PROMPT.md` text. Both agents may start independent work in parallel; shared auth/playback extraction and contract edits require one writer and reviewed prerequisite commits.
3. Parent agents assign subagents disjoint files and verify their diffs. They remain responsible for integration and evidence; no delegation-by-summary acceptance.
4. Track implementation outcomes in the corresponding `ACCEPTANCE.md` (not yet created because no checks have run). Use `not-run`, `pass`, `fail`, `blocked`; every pass points to actual proof.
5. Preserve single-process assumptions, per-user access and watch history. Use isolated runtime data/ports and designated test media. Do not copy secrets from an existing setup into the new worktrees.

The largest known technical risks are native authorization on all resource routes, effective-profile isolation, HLS full-item time mapping, stale asynchronous readiness/media events, same-account multi-device progress ordering, and device/output-specific HDR/audio behavior. These are explicit gates in the pack, not certified solved problems.

## Documentation validation

Before delivery, the research pack was independently reviewed for source accuracy, protocol consistency and handoff completeness. The [review record](REVIEW.md) lists findings incorporated and the documentation checks; those are documentation checks only. Future agents must run the actual implementation/build/device gates themselves.
