import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  copyFileSync,
  chmodSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
const revision = "7441c081b2276917bad1f04130c9e4fab091a4f6";
const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, ".cache", "lan-mouse");
const run = (cmd, args, cwd = source) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
mkdirSync(path.dirname(source), { recursive: true });
if (!existsSync(path.join(source, ".git")))
  run(
    "git",
    ["clone", "https://github.com/feschber/lan-mouse.git", source],
    root,
  );
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: source,
  encoding: "utf8",
}).trim();
if (head !== revision) run("git", ["checkout", revision]);
const patch = path.join(root, "scripts", "lan-mouse.patch");
try {
  execFileSync("git", ["apply", "--reverse", "--check", patch], {
    cwd: source,
    stdio: "pipe",
  });
} catch {
  run("git", ["apply", patch]);
}
const args = ["build", "--release", "--locked", "--no-default-features"];
if (process.platform === "linux")
  args.push("--features", "layer_shell_capture,wlroots_emulation");
run("cargo", args);
const out = path.join(root, "resources", "engine");
mkdirSync(out, { recursive: true });
const name = process.platform === "win32" ? "lan-mouse.exe" : "lan-mouse";
copyFileSync(
  path.join(source, "target", "release", name),
  path.join(out, name),
);
if (process.platform !== "win32") chmodSync(path.join(out, name), 0o755);
copyFileSync(path.join(source, "LICENSE"), path.join(out, "LICENSE-LAN-MOUSE"));
writeFileSync(
  path.join(out, "source.json"),
  JSON.stringify(
    {
      repository: "https://github.com/feschber/lan-mouse",
      revision,
      patch: "scripts/lan-mouse.patch",
    },
    null,
    2,
  ),
);
console.log("Bundled input engine built.");
