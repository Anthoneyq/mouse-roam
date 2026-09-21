"use strict";
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const output = path.join(__dirname, "..", "test-results");
  fs.mkdirSync(output, { recursive: true });
  const application = await electron.launch({
    ...(process.env.MOUSE_ROAM_APP
      ? { executablePath: process.env.MOUSE_ROAM_APP }
      : {}),
    args: process.env.MOUSE_ROAM_APP
      ? ["--preview"]
      : [path.join(__dirname, ".."), "--preview"],
    timeout: 30000,
  });
  try {
    await application.firstWindow();
    let page;
    for (let attempt = 0; attempt < 100; attempt++) {
      page = application
        .windows()
        .find((candidate) => candidate.url().includes("view=setup"));
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!page) throw new Error("Setup window did not open.");
    await page.waitForSelector("h1");
    await page.waitForFunction(() =>
      document.querySelector("#notice").textContent.includes("Design preview"),
    );
    assert.equal(
      await page.locator("h1").textContent(),
      "Just move your mouse.",
    );
    assert.equal(await page.locator("#start").isDisabled(), true);
    await page.screenshot({
      path: path.join(output, "setup.png"),
      fullPage: true,
    });
    await page
      .getByRole("radio", { name: "Other computer", exact: false })
      .check();
    assert.equal(await page.locator("#video-step").isHidden(), true);
    await page
      .getByRole("radio", { name: "Main computer (server)", exact: false })
      .check();
    assert.equal(await page.locator("#video-step").isVisible(), true);
    await page.locator("#video-enabled").uncheck();
    assert.equal(await page.locator("#capture-options").isHidden(), true);
    await page.locator("#video-enabled").check();
    const state = await page.evaluate(() => window.mouseRoam.state());
    assert.equal(state.ok, true);
    assert.equal(state.value.preview, true);
    const dangerous = await page.evaluate(() =>
      window.mouseRoam.save({ role: "invalid" }),
    );
    assert.equal(dangerous.ok, false);
    console.log(
      "Electron UI verified: onboarding, role selection, capture options, disabled connection, and IPC validation.",
    );
  } finally {
    await application.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
