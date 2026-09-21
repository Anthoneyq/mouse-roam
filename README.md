# Edge Switch

**Move your mouse to the edge. Switch computers.**

Use one keyboard and mouse across Windows, Mac, and Omarchy. With a capture card, the other computer’s picture appears on your main screen when you switch.

> **In development.** There is no finished public download yet. The Mac input engine builds; hardware switching across all three platforms still needs testing. This repository is a working prototype, not a promise that every setup works today.

## What you’ll need

- Two computers on the same home network.
- Edge Switch on both computers.
- To show the other computer on this screen: an HDMI capture card, its USB cable, and an HDMI connection from the other computer. A plain HDMI cable alone is not enough.

Already have a separate screen for each computer? You can turn off the capture-card view and just share the keyboard and mouse.

## The setup

**The main computer is the server. It’s the computer whose keyboard and mouse you’ll use.** It can run Windows, Mac, or Omarchy.

1. **Open Edge Switch on both computers.** On your main computer, choose **Main computer (server)**. On the second computer, choose **Other computer**.
2. **Connect the computers.** Choose the nearby computer, then check that both screens show the same pairing code.
3. **Choose your picture and screen edge.** If you’re using a capture card, select it and check the picture.

Approve the permissions your computer asks for. The app handles connection settings for you.

Move your mouse across your chosen edge to switch. Move back across the opposite edge to return.

**Need to return immediately?** Hold the left **Control + Alt + Shift** keys together. On a Mac, Alt is **Option**.

## Which computers?

Any of the three platforms is intended to be the main computer or the computer being controlled. Version and hardware support will be listed here as each combination passes testing. Video switching needs a compatible capture card attached to the main computer.

## Need help?

Use **Connection help** in the app. Keep both apps open, use the same home network, and allow Edge Switch through your firewall on private networks. Guest Wi-Fi may prevent the computers from finding each other.

## For contributors

[Build the app](docs/DEVELOPMENT.md) · [What still needs testing](docs/VERIFICATION.md) · [Credits](THIRD-PARTY.md)

Edge Switch builds on [Lan Mouse](https://github.com/feschber/lan-mouse) for keyboard and mouse sharing. The app and its input-engine modifications are available under GPL-3.0-or-later.
