# Show local development commands.
default:
    @just --list

# Run Remix/Vite with live reload. Example: just dev 9021
# An occupied port fails instead of silently changing the login origin.
dev port="9001" host="127.0.0.1":
    bun run dev --host {{ quote(host) }} --port {{ quote(port) }} --strictPort

# Run the same lint, type, and test checks as CI.
check:
    bun run lint
    bun run typecheck
    bun run test

# Run the test suite once.
test:
    bun run test

# Build the production client and server.
build:
    bun run build

# Serve the production build (run just build first; no live reload).
start:
    bun run start

# Preview release notes with git-cliff. Example: just release-notes --latest
release-notes *args="--unreleased --bump":
    GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null)}" bunx git-cliff@2.14.2 --strip header {{ args }}
