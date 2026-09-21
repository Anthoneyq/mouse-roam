"use strict";
const { EventEmitter } = require("node:events");
const https = require("node:https");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const selfsigned = require("selfsigned");
const { Bonjour } = require("bonjour-service");
const { pairingCode, identityOK, localAddress } = require("./core.cjs");
const cleanAddress = (a) => a?.replace(/^::ffff:/, "");
const certFingerprint = (socket) =>
  socket.getPeerCertificate()?.fingerprint256?.toLowerCase();

class Peers extends EventEmitter {
  constructor(store, engine) {
    super();
    this.store = store;
    this.engine = engine;
    this.found = new Map();
    this.pending = null;
    this.online = false;
    this.stopped = false;
  }
  identity() {
    return {
      id: this.store.data.id,
      name: os.hostname().slice(0, 80),
      platform: process.platform,
      input: this.engine.state.fingerprint,
      tls: this.tls,
      port: 4243,
      role: this.store.data.preferences.role,
    };
  }
  async start({ discovery = true, port = 4244 } = {}) {
    const file = path.join(this.store.directory, "pairing-identity.json");
    try {
      this.keys = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      this.keys = await selfsigned.generate(
        [{ name: "commonName", value: "Edge Switch" }],
        { keySize: 2048, algorithm: "sha256", days: 3650 },
      );
      fs.writeFileSync(file, JSON.stringify(this.keys), { mode: 0o600 });
    }
    this.tls = new crypto.X509Certificate(
      this.keys.cert,
    ).fingerprint256.toLowerCase();
    this.server = https.createServer(
      {
        key: this.keys.private,
        cert: this.keys.cert,
        requestCert: true,
        rejectUnauthorized: false,
        minVersion: "TLSv1.2",
      },
      (req, res) => this.route(req, res),
    );
    this.server.headersTimeout = 5000;
    this.server.requestTimeout = 8000;
    this.server.maxConnections = 16;
    this.server.on("tlsClientError", () => {});
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, "0.0.0.0", resolve);
    });
    this.apiPort = this.server.address().port;
    if (discovery) {
      this.bonjour = new Bonjour(undefined, (error) =>
        this.emit(
          "notice",
          "Automatic discovery is unavailable. Check that both computers use the same home network.",
        ),
      );
      this.service = this.bonjour.publish({
        name: `Edge Switch ${this.store.data.id}`,
        type: "edgeswitch",
        port: this.apiPort,
        txt: {
          id: this.store.data.id,
          name: os.hostname().slice(0, 80),
          platform: process.platform,
        },
      });
      this.browser = this.bonjour.find({ type: "edgeswitch" }, (service) => {
        const id = service.txt?.id;
        const address = service.addresses?.find(localAddress);
        if (
          !id ||
          id === this.store.data.id ||
          !address ||
          (this.found.size >= 64 && !this.found.has(id))
        )
          return;
        this.found.set(id, {
          id,
          name: String(service.txt.name || "Nearby computer").slice(0, 80),
          platform: String(service.txt.platform || ""),
          address,
          apiPort: service.port,
        });
        this.emit("change");
      });
      this.browser.on("down", (service) => {
        this.found.delete(service.txt?.id);
        this.emit("change");
      });
    }
    this.timer = setInterval(
      () => this.tick().catch((error) => this.emit("notice", error.message)),
      1500,
    );
    await this.tick();
  }
  snapshot() {
    const p = this.pending;
    return {
      nearby: [...this.found.values()],
      online: this.online,
      pairing:
        p && !p.completed
          ? {
              name: p.peer.name,
              code: p.code,
              accepted: p.accepted,
              expires: p.expires,
              direction: p.direction,
            }
          : null,
    };
  }
  async request(target, route, data, pin) {
    if (
      !localAddress(target.address) ||
      !Number.isInteger(target.apiPort) ||
      target.apiPort < 1 ||
      target.apiPort > 65535
    )
      throw new Error("This computer is not on a supported local network.");
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(data || {});
      const req = https.request(
        {
          hostname: target.address,
          port: target.apiPort,
          path: route,
          method: "POST",
          agent: false,
          key: this.keys.private,
          cert: this.keys.cert,
          rejectUnauthorized: false,
          minVersion: "TLSv1.2",
          timeout: 4000,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
          },
        },
        (res) => {
          const tls = certFingerprint(res.socket);
          if (!tls || (pin && tls !== pin.toLowerCase())) {
            res.destroy();
            reject(
              new Error(
                "The other computer’s identity changed. Forget it and pair again.",
              ),
            );
            return;
          }
          let text = "";
          res.on("data", (chunk) => {
            text += chunk;
            if (text.length > 16384) {
              res.destroy();
              reject(new Error("Unexpected response from the other computer."));
            }
          });
          res.on("error", reject);
          res.on("end", () => {
            try {
              const data = JSON.parse(text);
              if (res.statusCode !== 200)
                throw new Error(
                  data.error || "The other computer is not ready.",
                );
              resolve({ data, tls });
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on("timeout", () =>
        req.destroy(
          new Error(
            "The other computer did not respond. Check its app and network.",
          ),
        ),
      );
      req.on("error", reject);
      req.end(body);
    });
  }
  async route(req, res) {
    const send = (code, data) => {
      if (!res.writableEnded) {
        res.writeHead(code, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify(data));
      }
    };
    try {
      const address = cleanAddress(req.socket.remoteAddress),
        tls = certFingerprint(req.socket);
      if (req.method !== "POST" || !localAddress(address) || !tls)
        return send(403, {
          error: "Local pairing requires the Edge Switch app.",
        });
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 16384) {
          send(413, { error: "Request too large." });
          req.destroy();
          return;
        }
      }
      const data = JSON.parse(raw || "{}");
      if (req.url === "/hello")
        return send(200, {
          identity: this.identity(),
          pairedWith: this.store.data.peer?.id || null,
        });
      if (req.url === "/pair") {
        if (this.store.data.peer || this.pending)
          return send(409, {
            error:
              "The other computer is already paired or has a pairing request open.",
          });
        if (
          !identityOK(data.identity) ||
          data.identity.tls !== tls ||
          !/^[a-f0-9]{64}$/.test(data.nonce) ||
          !Number.isInteger(data.apiPort) ||
          data.apiPort < 1025 ||
          data.apiPort > 65535
        )
          return send(400, { error: "Invalid pairing request." });
        if (
          data.identity.role === this.store.data.preferences.role ||
          !["main", "other"].includes(data.identity.role)
        )
          return send(409, {
            error:
              "Choose “Use this keyboard and mouse” on one computer and “Control this computer” on the other.",
          });
        this.pending = {
          direction: "incoming",
          peer: { ...data.identity, address, apiPort: data.apiPort },
          nonce: data.nonce,
          code: pairingCode(this.identity(), data.identity, data.nonce),
          accepted: false,
          remoteAccepted: false,
          expires: Date.now() + 120000,
        };
        this.emit("change");
        this.emit("pair-request");
        return send(200, { identity: this.identity() });
      }
      if (req.url === "/pair-status") {
        const p = this.pending;
        if (
          !p ||
          p.direction !== "incoming" ||
          p.nonce !== data.nonce ||
          p.peer.tls !== tls ||
          p.expires < Date.now()
        )
          return send(410, { error: "Pairing expired. Please try again." });
        if (data.cancel) {
          this.pending = null;
          this.emit("change");
          return send(200, { cancelled: true });
        }
        p.remoteAccepted ||= data.accepted === true;
        const paired = p.accepted && p.remoteAccepted;
        if (paired && !p.completed) {
          this.complete(p.peer);
          p.completed = true;
        }
        return send(200, { accepted: p.accepted, paired });
      }
      if (req.url === "/forget") {
        if (this.store.data.peer?.tls !== tls)
          return send(403, { error: "This computer is not paired." });
        this.clearPeer();
        return send(200, { forgotten: true });
      }
      return send(404, { error: "Unknown request." });
    } catch {
      send(400, { error: "Could not read the request." });
    }
  }
  async pair(id) {
    if (this.store.data.peer || this.pending)
      throw new Error("Finish the current pairing first.");
    const target = this.found.get(id);
    if (!target) throw new Error("That computer is no longer nearby.");
    const nonce = crypto.randomBytes(32).toString("hex");
    const { data, tls } = await this.request(target, "/pair", {
      identity: this.identity(),
      nonce,
      apiPort: this.apiPort,
    });
    if (!identityOK(data.identity) || data.identity.tls !== tls)
      throw new Error("The other computer’s identity could not be checked.");
    this.pending = {
      direction: "outgoing",
      peer: {
        ...data.identity,
        address: target.address,
        apiPort: target.apiPort,
      },
      nonce,
      code: pairingCode(this.identity(), data.identity, nonce),
      accepted: false,
      expires: Date.now() + 120000,
    };
    this.emit("change");
  }
  confirm() {
    if (!this.pending || this.pending.expires < Date.now())
      throw new Error("Pairing expired. Start again.");
    this.pending.accepted = true;
    this.emit("change");
  }
  async cancel() {
    const p = this.pending;
    this.pending = null;
    this.emit("change");
    if (p?.direction === "outgoing")
      await this.request(
        p.peer,
        "/pair-status",
        { nonce: p.nonce, cancel: true },
        p.peer.tls,
      ).catch(() => {});
  }
  complete(peer) {
    this.store.data.peer = peer;
    this.store.save();
    this.engine.authorize(peer);
    this.emit("paired", peer);
    this.emit("change");
  }
  clearPeer() {
    const peer = this.store.data.peer;
    this.store.data.peer = null;
    this.store.save();
    this.engine.forget(peer);
    this.pending = null;
    this.online = false;
    this.emit("offline");
    this.emit("change");
  }
  async forget() {
    const peer = this.store.data.peer;
    this.clearPeer();
    if (peer) await this.request(peer, "/forget", {}, peer.tls).catch(() => {});
  }
  async tick() {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      const p = this.pending;
      if (p && p.expires < Date.now()) {
        this.pending = null;
        this.emit("change");
      } else if (p?.direction === "outgoing") {
        try {
          const { data } = await this.request(
            p.peer,
            "/pair-status",
            { nonce: p.nonce, accepted: p.accepted },
            p.peer.tls,
          );
          if (this.pending === p && data.paired && p.accepted) {
            this.pending = null;
            this.complete(p.peer);
          }
        } catch (e) {
          if (this.pending === p) {
            this.pending = null;
            this.emit("change");
            this.emit("notice", e.message);
          }
        }
      }
      const peer = this.store.data.peer;
      if (peer) {
        const target = this.found.get(peer.id) || peer;
        let online = false;
        try {
          const { data } = await this.request(target, "/hello", {}, peer.tls);
          online =
            identityOK(data.identity) &&
            data.identity.id === peer.id &&
            data.identity.input === peer.input &&
            data.pairedWith === this.store.data.id;
          if (online) {
            const changed =
              peer.address !== target.address ||
              peer.apiPort !== target.apiPort;
            Object.assign(peer, {
              address: target.address,
              apiPort: target.apiPort,
            });
            if (changed) this.store.save();
            if (!this.online || changed) this.emit("online", peer);
          }
        } catch {}
        if (this.online && !online) this.emit("offline");
        if (this.online !== online) {
          this.online = online;
          this.emit("change");
        }
      }
    } finally {
      this.ticking = false;
    }
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.browser?.stop();
    this.service?.stop();
    this.bonjour?.destroy();
    this.server?.closeAllConnections();
    this.server?.close();
  }
}
module.exports = { Peers };
