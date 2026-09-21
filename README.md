# Mouse Roam

**One keyboard and mouse for multiple local computers. Mac, Windows (testing), Linux (testing), Omarchy (testing).**

Move your mouse to the edge of the screen and it moves to your other computer. Your keyboard follows. With an HDMI capture card, the other computer’s screen appears on your main screen when you switch, so one keyboard, one mouse, and one monitor can run both computers.

Mouse Roam is a free, open-source software KVM (keyboard, video, mouse) switch. No switch box is needed.

> **In development.** There is no finished public download yet. The Mac app builds and runs; switching between real computers still needs testing on every platform. **(testing)** marks a platform that has not passed hardware testing. This repository is a working prototype, not a promise that every setup works today.

## Works with

| Computer                                             | Status                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| Mac (Apple Silicon and Intel)                        | App builds and runs. Switching between computers is in testing. |
| Windows 10 and 11                                    | (testing)                                                       |
| Omarchy                                              | (testing)                                                       |
| Other Linux with Hyprland or another wlroots desktop | (testing)                                                       |

Each platform is meant to work as either the main computer or the computer being controlled. This table is updated as each pair passes [hardware testing](docs/VERIFICATION.md).

## What you’ll need

- Two computers on the same home network.
- Mouse Roam on both computers.
- To show the other computer on this screen: an HDMI capture card, its USB cable, and an HDMI connection from the other computer. A plain HDMI cable alone is not enough.

Already have a separate screen for each computer? You can turn off the capture-card view and just share the keyboard and mouse.

## The setup

**The main computer is the server. It’s the computer whose keyboard and mouse you’ll use.** It can run Mac, Windows (testing), or Omarchy (testing).

1. **Open Mouse Roam on both computers.** On your main computer, choose **Main computer (server)**. On the second computer, choose **Other computer**.
2. **Connect the computers.** Choose the nearby computer, then check that both screens show the same pairing code.
3. **Choose your picture and screen edge.** If you’re using a capture card, select it and check the picture.

Approve the permissions your computer asks for. The app handles connection settings for you.

Move your mouse across your chosen edge to switch. Move back across the opposite edge to return.

**Need to return immediately?** Hold the left **Control + Alt + Shift** keys together. On a Mac, Alt is **Option**.

## Common questions

**How do I use one keyboard and mouse on two computers?** Install Mouse Roam on both, pair them once, and move your mouse across the screen edge you chose. The keyboard and mouse now control the other computer. Move back across the opposite edge to return.

**Can I share a mouse and keyboard between a Mac and a Windows PC?** That is what Mouse Roam is built for. Windows is still marked (testing), so expect rough edges until it passes hardware testing.

**Does it work on Linux and Omarchy?** It is built for Omarchy and other Hyprland or wlroots desktops, and both are marked (testing). Other Linux desktops, such as GNOME and KDE, are not supported yet.

**Is this a KVM switch?** Yes, a software one. There is no hardware switch box. With a capture card it also switches the screen, which keyboard-and-mouse sharing apps do not do.

**Do I need a capture card?** Only to see the other computer on your main screen. If each computer has its own screen, turn off the capture-card view and share just the keyboard and mouse. So far only the Elgato Game Capture HD60 S+ has been used.

**Does it work over the internet?** No. Both computers must be on the same local network. Guest Wi-Fi often blocks it.

**Is it free?** Yes. Mouse Roam is free and open source under GPL-3.0-or-later.

**How is it different from Synergy, Deskflow, Input Leap, Barrier, ShareMouse, or Mouse Without Borders?** Those share a keyboard and mouse between computers. Mouse Roam does that too, with guided setup and pairing codes, and can also bring the other computer’s screen onto your monitor through a capture card. It does not yet share the clipboard, files, or audio.

## Need help?

Use **Connection help** in the app. Keep both apps open, use the same home network, and allow Mouse Roam through your firewall on private networks. Guest Wi-Fi may prevent the computers from finding each other.

## For contributors

[Build the app](docs/DEVELOPMENT.md) · [What still needs testing](docs/VERIFICATION.md) · [Credits](THIRD-PARTY.md)

Mouse Roam builds on [Lan Mouse](https://github.com/feschber/lan-mouse) for keyboard and mouse sharing. The app and its input-engine modifications are available under GPL-3.0-or-later.
