import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
for (const dir of ["app", "scripts", "tests"])
  for (const file of readdirSync(dir))
    if (/\.(cjs|mjs)$/.test(file))
      execFileSync(process.execPath, ["--check", `${dir}/${file}`], {
        stdio: "inherit",
      });
execFileSync(process.execPath, ["--check", "ui/renderer.js"], {
  stdio: "inherit",
});
console.log("JavaScript syntax checked.");
