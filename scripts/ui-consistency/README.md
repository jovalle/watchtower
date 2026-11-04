# UI Consistency Preview

Run from the repository root after installing the normal project dependencies:

```sh
npm run build
node --import tsx scripts/ui-consistency/server.mjs
```

The server binds to `127.0.0.1:9345`. It renders the real production Remix components, replacing route loaders, actions and APIs with synthetic fixtures. It creates a disposable data directory and a fixture session secret. No Plex, Seerr, Trakt or real account mutations are used. This server is a local QA tool; it is not part of the production route tree.

- Open `/__audit/cases` for page IDs and paths. Add `?audit=ID` to a listed path (or `&audit=ID` when it already has a query).
- Open `/__audit/gallery?case=ID` for room, cinema and notification components; IDs are in `gallery-cases.json`.
- Open `/__audit/forms-gallery?case=ID` for shared menus, forms and streaming states; IDs are in `forms-gallery-cases.json`.
- A fixture cookie preserves the selected response through local form submissions. Submit the real form to reveal fixtures with action responses; `delayMs` holds the pending state.
- Home/Watchlist fixtures stream deferred data. Check both the initial shell and settled state. Galleries activate specified disclosures, pending states and failures through their real controls.
- The 60-second WebM is a generated, silent solid-color test clip. It exercises player layout without content or history from a real library. Browser autoplay restrictions may require pressing Play.

Check 320, 375, 768, 1024, 1440 and 1600px, 639/640 and 767/768 breakpoint transitions, and short landscape. Wait for the page's load event and deferred state before measuring. Inspect focus/keyboard behavior and content outside its container: root overflow hiding can mask clipped controls. Screenshot each page family and repeat affected cases after a fix.

Use one active tab when applying viewport overrides and saving screenshots. Verify `innerWidth` and `innerHeight` before each capture; opening extra tabs can redirect a browser-scoped viewport override. Include spans, labels, legends and fieldsets in long-content checks, not only headings and controls. Ignore empty decorative animation spans when checking text bounds. Exercise backdrop wheel input on a scrollable page and verify position restoration after every modal family.

Confirm the native rendered page matches each fixture before capturing. Use full-page captures to avoid the desktop surface cropping wide viewports, and record image dimensions as well as viewport dimensions. Review images for the correct state, especially when several cases share one pathname with different query parameters.

`tmp/consistency-audit/` contains generated bundles and route/case inventories. Stop the server with Ctrl-C to remove its disposable data directory. These fixtures verify presentation and synthetic behavior; live service compatibility and physical-device behavior require separate checks.
