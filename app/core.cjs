"use strict";
const crypto = require("node:crypto");
const net = require("node:net");

const SIDES = ["left", "right", "top", "bottom"];
const opposite = (side) =>
  ({ left: "right", right: "left", top: "bottom", bottom: "top" })[side];
const fingerprintOK = (value) =>
  typeof value === "string" && /^([a-f0-9]{2}:){31}[a-f0-9]{2}$/i.test(value);
const digest = (text) => crypto.createHash("sha256").update(text).digest("hex");
function pairingCode(a, b, nonce) {
  const identities = [a, b]
    .map((x) => `${x.tls.toLowerCase()}|${x.input.toLowerCase()}`)
    .sort();
  return String(
    parseInt(digest(JSON.stringify([identities, nonce])).slice(0, 12), 16) %
      100000000,
  )
    .padStart(8, "0")
    .replace(/(.{4})/, "$1 ");
}
function identityOK(x) {
  return (
    x &&
    /^[a-f0-9-]{36}$/.test(x.id) &&
    typeof x.name === "string" &&
    x.name.length > 0 &&
    x.name.length <= 80 &&
    fingerprintOK(x.input) &&
    fingerprintOK(x.tls) &&
    Number.isInteger(x.port) &&
    x.port > 1024 &&
    x.port <= 65535
  );
}
function validatePreferences(p) {
  if (
    !p ||
    !["main", "other"].includes(p.role) ||
    !SIDES.includes(p.side) ||
    typeof p.video !== "boolean" ||
    typeof p.camera !== "string" ||
    p.camera.length > 512 ||
    typeof p.startAtLogin !== "boolean"
  )
    throw new Error("Choose your computer, screen edge, and video source.");
  return {
    role: p.role,
    side: p.side,
    video: p.video,
    camera: p.camera,
    startAtLogin: p.startAtLogin,
  };
}
function localAddress(address) {
  return (
    net.isIPv4(address) &&
    (address.startsWith("10.") ||
      address.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
      address.startsWith("169.254.") ||
      address.startsWith("127."))
  );
}
class Lines {
  constructor(onLine) {
    this.buffer = "";
    this.onLine = onLine;
  }
  push(chunk) {
    this.buffer += chunk.toString();
    if (this.buffer.length > 1024 * 1024)
      throw new Error("Input service sent too much data.");
    let index;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (line.trim()) this.onLine(JSON.parse(line));
    }
  }
}
module.exports = {
  SIDES,
  opposite,
  fingerprintOK,
  pairingCode,
  identityOK,
  validatePreferences,
  localAddress,
  Lines,
};
