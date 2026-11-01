# Research and handoff review record

Date: 2026-09-27. Repository baseline: `8578769ae3273a5918910b769053d494c56c7ae6`.

This record describes documentation review, not feature validation. Three subagents independently researched/reviewed Watch Together, Android TV and repository integration. The primary agent reconciled the shared contract and both implementation prompts. No implementation, media playback, device build, production configuration, signing operation or deployment occurred.

## Findings incorporated

| Finding | Resulting handoff requirement |
| --- | --- |
| Existing voting SSE is unauthenticated file polling | New authenticated room service; reuse framing only |
| Resource routes do not inherit layout authentication | Principal/authorization at each native/room resource boundary |
| Cookie signing was liable to be mistaken for secret storage | Explicit signed-not-encrypted baseline; separate protected native credential model |
| Browser Android heuristic/Chrome profile would misclassify TV | Explicit native capability selection and coordinated backend extraction |
| HLS offset and Media3 timeline could disagree | Full-item millisecond normalization and real nonzero-offset tests |
| Same-account devices share current progress generation scope | Device/player scope while retaining replacement ordering |
| Delayed readiness can release a newer seek | Preparation generation and current owned playback-session checks |
| SSE comment pings are not observable by browser JavaScript | Named heartbeat or acknowledged presence, bounded liveness |
| Reconnect loses client counters | Private command/presence next-sequence recovery |
| Idempotency originally covered commands only | Expiring payload-aware create/join/invitation retry protocol |
| Next-item metadata could reach a denied member | Remove denied members before publishing new metadata; safe terminal envelope |
| Local track reconfiguration and unexpected buffering needed distinct rules | Acknowledged temporary nonblocking replacement versus authoritative group buffering pause |
| Profile switch could reinterpret delayed mutations | Wire identity version, immutable principal and pre-side-effect recheck |
| Generic signing restriction conflicted with debug builds | Disposable debug signing explicitly permitted |
| Play upload key can differ from app-signing key | Cross-channel signing/certificate upgrade plan and tests |

## Documentation checks

Automated local checks covered relative Markdown links, balanced fenced blocks, placeholder markers, complete unique WT-01–22 and TV-01–32 feature rows, and explicit subagent instructions in both prompts. Delivery additionally compares file hashes between the worktree copies and checks whitespace with Git. These checks detect packaging mistakes; they do not prove the proposed system works.

Primary references are linked next to relevant research claims. Plex Watch Together's announcement was available in the official indexed result; direct retrieval returned 403, which is disclosed in research. Time-sensitive Android/Play/library requirements must be rechecked during implementation. The architecture, tuning constants, endpoint names and performance budgets are explicitly proposed rather than attributed to upstream products.

## Open implementation evidence

All feature build/test/live acceptance remains unrun. Named TV hardware, designated Plex accounts/test media, managed-profile API behavior, canonical HLS timeline mapping, actual HDR/audio output, integrated web↔TV timing, and production ingress behavior need implementation-time evidence. Both sideloading and Google Play are required; broader Plex product domains are explicitly tracked as scope decisions. No reviewer certified universal parity or absence of bugs.
