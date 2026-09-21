const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Store } = require("../app/store.cjs");
const { Peers } = require("../app/peers.cjs");
function make(role, byte) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "edge-pair-test-"));
  const store = new Store(directory);
  store.data.preferences.role = role;
  const calls = [];
  const engine = {
    state: { fingerprint: Array(32).fill(byte).join(":") },
    authorize: (peer) => calls.push(["authorize", peer.id]),
    forget: (peer) => calls.push(["forget", peer?.id]),
  };
  return { directory, store, calls, peers: new Peers(store, engine) };
}
test("real TLS pairing requires approval on both computers, pins identity, and forgets both sides", async (t) => {
  const a = make("main", "ab"),
    b = make("other", "cd");
  t.after(() => {
    a.peers.stop();
    b.peers.stop();
    fs.rmSync(a.directory, { recursive: true, force: true });
    fs.rmSync(b.directory, { recursive: true, force: true });
  });
  await Promise.all([
    a.peers.start({ discovery: false, port: 0 }),
    b.peers.start({ discovery: false, port: 0 }),
  ]);
  clearInterval(a.peers.timer);
  clearInterval(b.peers.timer);
  a.peers.found.set(b.store.data.id, {
    id: b.store.data.id,
    name: "Other",
    address: "127.0.0.1",
    apiPort: b.peers.apiPort,
  });
  await a.peers.pair(b.store.data.id);
  assert.equal(a.peers.pending.code, b.peers.pending.code);
  assert.equal(a.calls.length + b.calls.length, 0);
  a.peers.confirm();
  await a.peers.tick();
  assert.equal(
    a.calls.length + b.calls.length,
    0,
    "one approval must not authorize input",
  );
  b.peers.confirm();
  await a.peers.tick();
  assert.equal(a.calls.length, 1);
  assert.equal(b.calls.length, 1);
  assert.equal(a.store.data.peer.tls, b.peers.tls);
  assert.equal(b.store.data.peer.tls, a.peers.tls);
  assert.equal(b.peers.snapshot().pairing, null);
  await b.peers.tick();
  assert.equal(a.peers.online, true);
  assert.equal(b.peers.online, true);
  await assert.rejects(
    a.peers.request(
      a.store.data.peer,
      "/hello",
      {},
      Array(32).fill("00").join(":"),
    ),
    /identity changed/,
  );
  await a.peers.forget();
  assert.equal(a.store.data.peer, null);
  assert.equal(b.store.data.peer, null);
});
test("same-role pairing is rejected without granting input", async (t) => {
  const a = make("main", "12"),
    b = make("main", "34");
  t.after(() => {
    a.peers.stop();
    b.peers.stop();
    fs.rmSync(a.directory, { recursive: true, force: true });
    fs.rmSync(b.directory, { recursive: true, force: true });
  });
  await Promise.all([
    a.peers.start({ discovery: false, port: 0 }),
    b.peers.start({ discovery: false, port: 0 }),
  ]);
  a.peers.found.set(b.store.data.id, {
    id: b.store.data.id,
    name: "Other",
    address: "127.0.0.1",
    apiPort: b.peers.apiPort,
  });
  await assert.rejects(a.peers.pair(b.store.data.id), /Choose/);
  assert.equal(a.calls.length + b.calls.length, 0);
});
