# Credits and source

The input engine is [Lan Mouse](https://github.com/feschber/lan-mouse), copyright its contributors, under GPL-3.0-or-later. Edge Switch does not claim authorship of that engine.

Pinned upstream revision: `7441c081b2276917bad1f04130c9e4fab091a4f6`.

`scripts/build-engine.mjs` fetches that source and applies `scripts/lan-mouse.patch`. The patch adds input-control start/return notifications, explicit release and pause requests, an isolated IPC endpoint, removal of the final saved client, and checks for revoked access on established input connections. Build instructions are in `docs/DEVELOPMENT.md`. Distribution must include access to the exact corresponding source and patch; release automation includes an engine-source archive.

The desktop shell uses Electron (MIT), bonjour-service (MIT), and selfsigned (MIT). The lockfile identifies exact dependency versions. Their license notices remain in packaged dependencies. The Electron distribution includes its own third-party notices.
