# Verification

## Acceptance criteria

A nontechnical user must be able to install, pair, choose a picture, switch, and recover without a terminal or editing files. Platform support means both sending and receiving input, plus capture-card viewing when that platform is the main computer.

## Checks available in this repository

- `npm test`: tests include real local TLS pairing; one approval must not enable input; changed identities must be rejected; forgetting must remove access. The engine test uses dummy input backends, so it does not establish physical input correctness.
- `npm run check`: JavaScript syntax.
- `node scripts/verify-ui.cjs`: real Electron preview, role choices, capture options, basic IPC validation, screenshot.
- `npm run engine`: builds pinned, patched Lan Mouse from source.
- `npm run package`: packages the current platform’s application.

## Recorded checks (2026-09-21)

- Current Mac source: input engine compiled; all seven tests passed; the development interface and packaged Apple Silicon app passed the Electron UI check. The final screen was visually inspected, including “Main computer (server)” wording.
- The Apple Silicon DMG and ZIP were built locally. They use ad-hoc signing and are not notarized consumer releases.
- [Initial cross-platform workflow](https://github.com/Anthoneyq/edge-switch/actions/runs/35628906963) tests commit `166085b`. Later local changes pin the input receiver’s certificate, prevent early edge activation, and clarify the server wording. That initial workflow is not evidence that the latest commit has passed on every platform.

## Hardware release gates — pending

Test all six directed platform pairs: Mac → Windows, Mac → Omarchy, Windows → Mac, Windows → Omarchy, Omarchy → Mac, and Omarchy → Windows.

For each, verify clean installation, permission prompts, discovery, both pairing confirmations, normal typing, modifier shortcuts, scrolling, edge entry, opposite-edge return, emergency release, video resolution/scaling, multiple displays, capture-card unplug/replug, network loss/recovery, sleep/wake, screen lock, forgotten peers, and uninstall.

Use at least two capture-card models. The original personal workflow uses an Elgato Game Capture HD60 S+. No broader capture-card compatibility claim has been verified.

## Known limits

- There is no finished public release or verified hardware support matrix yet.
- Omarchy fullscreen video layering and input capture together require a real Hyprland session test.
- No clipboard synchronization, audio forwarding, internet remote access, or BIOS control is implemented.
- Discovery requires local IPv4 networking; guest-network isolation can block it.
- Camera “ready” means a video stream opened. It does not prove an HDMI source has a signal; the user must check the picture.
- Signing/notarization, automatic updates, platform-specific removal of saved data, and clean-machine installation testing remain release work.
- Windows local engine IPC uses a dynamically selected loopback TCP port; hardening this to an OS-authenticated named pipe is additional release work for shared-user systems.
