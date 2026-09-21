"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
class Store {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, "settings.json");
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT")
        throw new Error(
          "Your saved settings could not be read. Please restore settings.json from a backup.",
        );
      this.data = {};
    }
    this.data.id ||= crypto.randomUUID();
    this.data.preferences ||= {
      role: "main",
      side: "left",
      video: true,
      camera: "",
      startAtLogin: false,
    };
    this.data.peer ||= null;
    this.save();
  }
  save() {
    const temp = this.file + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
}
module.exports = { Store };
