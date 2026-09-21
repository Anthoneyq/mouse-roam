"use strict";
const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { Lines } = require("./core.cjs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class Engine extends EventEmitter {
  constructor(directory, binary) {
    super();
    this.directory = directory;
    this.binary = binary;
    this.state = {
      running: false,
      capture: false,
      emulation: false,
      fingerprint: null,
    };
    this.clients = [];
    this.pending = [];
  }
  request(value) {
    if (!this.socket || this.socket.destroyed)
      throw new Error("The input service is not ready yet.");
    this.socket.write(JSON.stringify(value) + "\n");
  }
  async start({ testBackends = false } = {}) {
    if (!fs.existsSync(this.binary))
      throw new Error(
        "This development copy is missing its input service. Use a complete installer.",
      );
    const config = path.join(this.directory, "input.toml");
    if (!fs.existsSync(config))
      fs.writeFileSync(
        config,
        'port = 4243\nrelease_bind = ["KeyLeftCtrl", "KeyLeftAlt", "KeyLeftShift"]\n',
        { mode: 0o600 },
      );
    // Saved edges must not activate before the app has checked the peer and video.
    fs.writeFileSync(
      config,
      fs
        .readFileSync(config, "utf8")
        .replace(
          /activate_on_startup\s*=\s*true/g,
          "activate_on_startup = false",
        ),
      { mode: 0o600 },
    );
    const endpoint =
      process.platform === "win32"
        ? { host: "127.0.0.1", port: await freePort() }
        : path.join(this.directory, "input.sock");
    this.stopping = false;
    const args = [
      "--config",
      config,
      "--cert-path",
      path.join(this.directory, "input.pem"),
    ];
    if (testBackends)
      args.push("--capture-backend", "dummy", "--emulation-backend", "dummy");
    this.child = spawn(this.binary, [...args, "daemon"], {
      windowsHide: true,
      env: {
        ...process.env,
        EDGE_SWITCH_SOCKET: typeof endpoint === "string" ? endpoint : "",
        EDGE_SWITCH_IPC_PORT: String(endpoint.port || ""),
        EDGE_SWITCH_PEER_PIN: path.join(this.directory, "peer-fingerprint"),
        RUST_LOG: "info",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    this.log = "";
    this.child.stderr.on("data", (data) => {
      this.log = (this.log + data).slice(-16000);
    });
    this.child.on("error", (error) => this.emit("fault", error.message));
    this.child.on("exit", () => {
      this.state.running = false;
      this.socket?.destroy();
      if (!this.stopping)
        this.emit(
          "fault",
          "The input service stopped. Reopen Edge Switch to reconnect.",
        );
      this.emit("state", this.state);
    });
    for (let i = 0; i < 60; i++) {
      if (this.child.exitCode !== null)
        throw new Error(
          "The input service could not start. Check that another Edge Switch is not already open.",
        );
      try {
        this.socket = await connect(endpoint);
        break;
      } catch {
        await delay(100);
      }
    }
    if (!this.socket)
      throw new Error(
        "The input service did not respond. Reopen the app and try again.",
      );
    this.state.running = true;
    const lines = new Lines((event) => this.handle(event));
    this.socket.on("data", (data) => {
      try {
        lines.push(data);
      } catch {
        this.socket.destroy();
        this.emit("fault", "The input service sent an unreadable response.");
      }
    });
    this.socket.on("error", () => {});
    this.socket.on("close", () => {
      this.state.running = false;
      this.emit("returned");
      this.emit("state", this.state);
    });
    this.request("Sync");
    for (let i = 0; i < 50 && !this.state.fingerprint; i++) await delay(100);
    if (!this.state.fingerprint)
      throw new Error(
        "The input service could not create this computer’s identity.",
      );
    // Persisted edges stay off until the saved, pinned peer is rediscovered.
    for (const [id] of this.clients) this.request({ Activate: [id, false] });
  }
  handle(event) {
    if (event.PublicKeyFingerprint)
      this.state.fingerprint = event.PublicKeyFingerprint;
    if (event.CaptureStatus)
      this.state.capture = event.CaptureStatus === "Enabled";
    if (event.EmulationStatus)
      this.state.emulation = event.EmulationStatus === "Enabled";
    if (event.Enumerate) this.clients = event.Enumerate;
    if (event.Created) {
      this.clients.push(event.Created);
      this.pending.shift()?.(event.Created[0]);
    }
    if (event.Deleted !== undefined)
      this.clients = this.clients.filter((c) => c[0] !== event.Deleted);
    if (event.State)
      this.clients = this.clients.map((c) =>
        c[0] === event.State[0] ? event.State : c,
      );
    if (event.ControlStarted !== undefined)
      this.emit("entered", event.ControlStarted);
    if (event === "ControlReturned" || event.CaptureStatus === "Disabled")
      this.emit("returned");
    if (event.Error) this.emit("fault", event.Error);
    this.emit("state", this.state);
  }
  authorize(peer) {
    this.request({ AuthorizeKey: [peer.name, peer.input] });
  }
  async configure(peer, preferences) {
    this.release();
    fs.writeFileSync(
      path.join(this.directory, "peer-fingerprint"),
      peer.input || "",
      { mode: 0o600 },
    );
    this.request({ SetInputEnabled: true });
    for (const [id] of this.clients) this.request({ Delete: id });
    this.clients = [];
    if (preferences.role !== "main") return;
    const handle = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = [];
        reject(new Error("Could not connect the screen edge. Try again."));
      }, 3000);
      this.pending.push((id) => {
        clearTimeout(timer);
        resolve(id);
      });
      this.request("Create");
    });
    this.request({ UpdateFixIps: [handle, [peer.address]] });
    this.request({ UpdatePort: [handle, peer.port] });
    this.request({ UpdatePosition: [handle, preferences.side] });
    this.request({ Activate: [handle, true] });
  }
  release() {
    if (this.state.running) this.request("ReleaseInput");
    this.emit("returned");
  }
  pause() {
    this.release();
    if (this.state.running) this.request({ SetInputEnabled: false });
    if (this.state.running)
      for (const [id] of this.clients) this.request({ Activate: [id, false] });
  }
  forget(peer) {
    this.pause();
    fs.writeFileSync(path.join(this.directory, "peer-fingerprint"), "", {
      mode: 0o600,
    });
    if (this.state.running && peer)
      this.request({ RemoveAuthorizedKey: peer.input });
    for (const [id] of this.clients)
      if (this.state.running) this.request({ Delete: id });
  }
  retryPermissions() {
    this.request("EnableCapture");
    this.request("EnableEmulation");
  }
  stop() {
    this.stopping = true;
    try {
      this.pause();
    } catch {}
    this.socket?.destroy();
    this.child?.kill();
  }
}
function connect(endpoint) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection(endpoint);
    s.once("error", reject);
    s.once("connect", () => {
      s.removeListener("error", reject);
      resolve(s);
    });
  });
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
module.exports = { Engine };
