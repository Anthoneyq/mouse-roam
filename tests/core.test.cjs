const test = require("node:test");
const assert = require("node:assert/strict");
const {
  pairingCode,
  validatePreferences,
  localAddress,
  Lines,
} = require("../app/core.cjs");
const fp = (n) => Array(32).fill(n).join(":");
test("pairing code is identical on both screens and changes when an identity changes", () => {
  const a = { tls: fp("ab"), input: fp("cd") },
    b = { tls: fp("ef"), input: fp("12") };
  assert.equal(pairingCode(a, b, "nonce"), pairingCode(b, a, "nonce"));
  assert.notEqual(
    pairingCode(a, b, "nonce"),
    pairingCode(a, { ...b, input: fp("34") }, "nonce"),
  );
  assert.notEqual(pairingCode(a, b, "nonce"), pairingCode(a, b, "other nonce"));
  assert.match(pairingCode(a, b, "nonce"), /^\d{4} \d{4}$/);
});
test("only explicit local IPv4 destinations may receive discovery requests", () => {
  for (const address of [
    "10.2.0.4",
    "192.168.0.2",
    "172.16.1.2",
    "172.31.5.6",
    "127.0.0.1",
  ])
    assert.equal(localAddress(address), true);
  for (const address of [
    "172.32.0.1",
    "8.8.8.8",
    "example.org",
    "127.0.0.1.attacker.test",
    "::1",
    "192.168.0.999",
  ])
    assert.equal(localAddress(address), false);
});
test("renderer cannot pass executable paths or unknown preferences into settings", () => {
  const p = {
    role: "main",
    side: "left",
    video: true,
    camera: "device-id",
    startAtLogin: false,
  };
  assert.deepEqual(validatePreferences({ ...p, command: "arbitrary" }), p);
  assert.throws(() => validatePreferences({ ...p, side: "execute" }));
  assert.throws(() => validatePreferences({ ...p, video: "yes" }));
});
test("IPC handles fragmented messages and rejects oversized frames", () => {
  const out = [],
    parser = new Lines((value) => out.push(value));
  parser.push('{"Control');
  parser.push('Started":4}\n"ControlReturned"\n');
  assert.deepEqual(out, [{ ControlStarted: 4 }, "ControlReturned"]);
  assert.throws(() => parser.push("a".repeat(1024 * 1024 + 1)));
});
