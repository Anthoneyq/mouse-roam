# Development

The main README is for users. These instructions are for contributors building the prototype.

## Requirements

- Node.js 22 or newer, npm, Git, and a current stable Rust toolchain.
- macOS: Xcode Command Line Tools.
- Windows: Visual Studio Build Tools with the C++ workload; use the MSVC Rust toolchain.
- Omarchy / Arch: `base-devel`, `pkgconf`, `wayland`, and the normal Hyprland desktop session. Build on Linux to generate its input engine.

```sh
npm ci
npm run engine
npm test
npm start
```

`npm run preview` opens only the interface. It does not start a keyboard/mouse service or discover peers.

`node scripts/verify-ui.cjs` drives the Electron preview with Playwright and saves a screenshot under `test-results/`.

`npm run package` builds the current platform’s installer. It requires the engine to have been built on that same OS and architecture. Do not copy the Mac engine into a Windows or Linux package.

## Structure

- `app/`: settings, native input-service supervision, discovery/pairing, window management.
- `ui/`: guided setup and capture-card viewer.
- `scripts/`: reproducible input-engine build and small upstream patch.
- `tests/`: framing, settings, real TLS pairing, and engine IPC probes.

The input engine uses its own config and certificate. It does not read or edit an existing Lan Mouse installation. It listens on UDP 4243; pairing uses TCP 4244, and discovery uses mDNS. Discovery currently requires local IPv4 connectivity. Both apps must be running in logged-in desktop sessions. This does not provide BIOS control.

Pairing uses mutual TLS certificates and an eight-digit code derived from both TLS and input identities and a fresh nonce. Both people/screens must confirm the same code before input fingerprints are authorized. Reconnection pins the saved identities. This is an initial implementation, not an independent security audit.

The source patch emits a start event after the other computer acknowledges input, and a return event when capture is released. Capture video is provided by Chromium’s camera APIs. No desktop or camera video is uploaded to a server.

## Distribution

The manual GitHub Actions workflow builds Windows x64, macOS arm64/x64, and Linux x64 packages. Build results do not establish hardware compatibility. The workflow does not publish a release.

Mac signing/notarization and Windows code signing are not configured. Unsigned prototypes do not meet the intended frictionless installation standard. Do not market these builds as a finished consumer release.

For release, add the appropriate signing credentials through repository secrets, verify first-run permissions and installation on clean machines, and make matching source archives available alongside binaries. Linux AppImage execution and capture access must be checked specifically on a clean Omarchy installation.
