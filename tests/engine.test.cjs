const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { Engine } = require("../app/engine.cjs");
const binary = path.join(
  __dirname,
  "..",
  "resources",
  "engine",
  process.platform === "win32" ? "lan-mouse.exe" : "lan-mouse",
);
test(
  "built input service exposes identity, configures an edge, and explicitly returns control",
  { skip: !fs.existsSync(binary) },
  async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "edge-engine-"));
    const engine = new Engine(directory, binary);
    const faults = [];
    engine.on("fault", (e) => faults.push(e));
    t.after(async () => {
      engine.stop();
      await new Promise((r) => setTimeout(r, 200));
      fs.rmSync(directory, { recursive: true, force: true });
    });
    await engine.start({ testBackends: true });
    assert.match(engine.state.fingerprint, /^([a-f0-9]{2}:){31}[a-f0-9]{2}$/i);
    await engine.configure(
      { address: "127.0.0.2", port: 4243 },
      { role: "main", side: "right" },
    );
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(engine.clients.length, 1);
    assert.equal(engine.clients[0][1].pos, "right");
    // Observe the daemon event, not Engine.release()'s local UI fallback.
    const returned = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("No return event from daemon")),
        2000,
      );
      engine.once("returned", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    engine.request("ReleaseInput");
    await returned;
    engine.forget(null);
    await new Promise((r) => setTimeout(r, 300));
    engine.request("Sync");
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(
      engine.clients.length,
      0,
      "last removed client must not reappear from disk",
    );
    assert.deepEqual(faults, []);
  },
);
