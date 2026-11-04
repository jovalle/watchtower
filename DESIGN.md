# Watchtower Interface Conventions

Preserve the existing dark streaming interface and mango accent. Use `app/lib/design/tokens.ts` for colors; its browser-surface CSS variables must match. Metadata and placeholder text must remain readable on the elevated surface, not only on the page background.

## Page Frame

- Browse pages share the 64px Header row plus safe-area inset. Their outer `Container size="wide"` uses the same responsive gutters and 1536px maximum width.
- Use `PageHeader` for ordinary page titles/actions and `SectionNavigation` for section tabs. Keep the title and toolbar mounted through pending, empty and failure states.
- Readable forms constrain an inner column; their page header stays aligned to the shared outer frame.
- Media heroes, public landing, Private Cinema and fullscreen playback retain their established presentation. Fullscreen playback owns the viewport and removes the browse scrollbar gutter.
- Test 320, 375, 768, 1024, 1440 and 1600px, breakpoint edges, and short landscape. Root overflow hiding is not proof that content fits: inspect clipped descendants too.

## Controls by Role

| Role | Convention |
| --- | --- |
| Ordinary action | `Button` or `buttonStyles`; 44px minimum target, 6px radius |
| Media hero action | Shared `size="lg"`; 56px minimum height and 18px type |
| Primary action | Mango background and dark accent foreground |
| Secondary action or external media action | Shared outlined secondary style |
| Quiet action | Shared ghost style; preserve a visible keyboard focus indicator |
| Filter, navigation, menu or icon action | At least 44px target; explicit selected/expanded state and meaningful accessible name |
| Card/player overlay | Contextual control style is intentional; show on focus and touch, hide inactive controls from focus |
| Inline text link | Remains a text link; clear focus and destination |

Use the existing input styles for inputs, selects and textareas. Do not apply action-button styles to form fields. Do not hide a meaningful action label merely to shorten a row; wrap or stack the row at narrow widths.

## States and Content

- Pending actions disable duplicate submission, preserve their label/geometry, and announce progress. A failure keeps the current task and data available and exposes a retryable error.
- Empty data and unavailable upstream data are different states. Show the reason/recovery when loading fails.
- Long media titles, account names, server URLs, device names and error messages must wrap or truncate inside a constrained `min-w-0`/`max-w-full` region. Keep adjacent controls reachable.
- Use native modal dialogs for protected tasks where possible. Bound height with `dvh`, allow panel scrolling, support Escape, contain focus and restore it to the trigger. Avoid interactive elements nested inside another button/link.
- Keep inactive drawers/overlays out of keyboard navigation. Pause automatic content rotation while a user is interacting with it.
- Title case app-authored headings and action names in source. Preserve media titles, proper names, user content and sentence-case body text. Accessible names and tooltips match their visible action.

## Verification

Focused behavioral tests cover pending/error/navigation/focus regressions. The consistency audit fixtures render the real page components with synthetic data and no live account mutations. Record page/state coverage and responsive failures before claiming completion; retain screenshots and raw measurements with the audit report.
