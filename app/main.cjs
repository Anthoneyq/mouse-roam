"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  screen,
  Menu,
  Tray,
  nativeImage,
  systemPreferences,
  shell,
  powerMonitor,
  dialog,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { Store } = require("./store.cjs");
const { Engine } = require("./engine.cjs");
const { Peers } = require("./peers.cjs");
const { validatePreferences } = require("./core.cjs");
const preview = process.argv.includes("--preview");
let window,
  viewer,
  tray,
  store,
  engine,
  peers,
  quitting = false,
  paused = true,
  notice = "",
  cameraReady = false,
  previewTimer,
  configuring = false;
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  window?.show();
  window?.focus();
});
function state() {
  return {
    preview,
    platform: process.platform,
    preferences: store?.data.preferences,
    peer: store?.data.peer
      ? { name: store.data.peer.name, platform: store.data.peer.platform }
      : null,
    engine: engine?.state || {
      running: false,
      capture: false,
      emulation: false,
    },
    network: peers?.snapshot() || { nearby: [], online: false, pairing: null },
    paused,
    notice,
    cameraReady,
  };
}
function broadcast() {
  for (const w of [window, viewer])
    if (w && !w.isDestroyed()) w.webContents.send("state", state());
}
function tell(message) {
  notice = message;
  broadcast();
}
function hideViewer() {
  clearTimeout(previewTimer);
  if (viewer && !viewer.isDestroyed()) viewer.hide();
}
function release() {
  try {
    engine?.release();
  } catch {}
  hideViewer();
}
function createWindow(overlay = false) {
  const w = new BrowserWindow({
    width: overlay ? 900 : 1000,
    height: overlay ? 620 : 790,
    minWidth: overlay ? 400 : 760,
    minHeight: overlay ? 300 : 650,
    show: false,
    backgroundColor: overlay ? "#000000" : "#f5f5f0",
    title: overlay ? "Other computer — Mouse Roam" : "Mouse Roam",
    frame: !overlay,
    focusable: !overlay,
    skipTaskbar: overlay,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (event) => event.preventDefault());
  w.loadFile(path.join(__dirname, "..", "ui", "index.html"), {
    query: { view: overlay ? "video" : "setup" },
  });
  if (overlay) {
    w.setAlwaysOnTop(true, "screen-saver");
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    w.setIgnoreMouseEvents(true);
  } else {
    w.once("ready-to-show", () => w.show());
    w.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        w.hide();
      }
    });
  }
  return w;
}
function showViewer() {
  if (!store.data.preferences.video || paused) return;
  if (!cameraReady) {
    release();
    tell("Connect the capture card and check its picture before switching.");
    return;
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  viewer.setBounds(display.bounds);
  viewer.showInactive();
  if (process.platform === "linux") viewer.setFullScreen(true);
}
async function configure() {
  if (
    configuring ||
    !engine?.state.running ||
    !peers?.online ||
    !store.data.peer ||
    paused
  )
    return;
  const p = store.data.preferences;
  if (p.role === "main" && (!engine.state.capture || (p.video && !cameraReady)))
    return;
  if (!engine.state.emulation) return;
  configuring = true;
  try {
    await engine.configure(store.data.peer, p);
    notice = "";
  } catch (e) {
    tell(e.message);
  } finally {
    configuring = false;
    broadcast();
  }
}
function checkSender(event) {
  if (
    ![window?.webContents.id, viewer?.webContents.id].includes(event.sender.id)
  )
    throw new Error("Unrecognized app window.");
}
function setupIPC() {
  const handle = (channel, fn) =>
    ipcMain.handle(channel, async (event, ...args) => {
      checkSender(event);
      try {
        return { ok: true, value: await fn(...args) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  handle("state", () => state());
  handle("save", async (value) => {
    const p = validatePreferences(value);
    if (store.data.peer && p.role !== store.data.preferences.role)
      throw new Error(
        "Forget the paired computer before changing which keyboard you use.",
      );
    release();
    engine?.pause();
    cameraReady = false;
    store.data.preferences = p;
    store.save();
    if (!preview) setLogin(p.startAtLogin);
    viewer.webContents.send("video", {
      enabled: p.role === "main" && p.video,
      camera: p.camera,
    });
    if (!p.video) await configure();
    broadcast();
    return state();
  });
  handle("pair", async (id) => {
    if (preview) throw new Error("Preview mode does not connect to computers.");
    if (typeof id !== "string" || id.length > 100)
      throw new Error("Choose a nearby computer.");
    await peers.pair(id);
    broadcast();
  });
  handle("confirm", () => {
    peers?.confirm();
    broadcast();
  });
  handle("cancel", async () => {
    await peers?.cancel();
    broadcast();
  });
  handle("forget", async () => {
    paused = true;
    release();
    await peers?.forget();
    broadcast();
  });
  handle("pause", () => {
    paused = true;
    engine?.pause();
    hideViewer();
    broadcast();
  });
  handle("resume", async () => {
    if (!store.data.peer) throw new Error("Pair your other computer first.");
    paused = false;
    await configure();
    broadcast();
  });
  handle("permissions", async () => {
    if (preview) return;
    if (process.platform === "darwin") {
      systemPreferences.isTrustedAccessibilityClient(true);
      if (store.data.preferences.video)
        await systemPreferences.askForMediaAccess("camera");
    }
    engine?.retryPermissions();
    broadcast();
  });
  handle("help", () =>
    dialog.showMessageBox(window, {
      type: "info",
      title: "Connection help",
      message: "Keep both apps open on the same home network.",
      detail:
        "Allow Mouse Roam through the firewall on your private network. Guest Wi-Fi can block nearby computers. For video, connect the other computer’s HDMI output to the capture card, then connect the card’s USB cable to this computer.\n\nReturn control any time: hold the left Control + Alt (Option on Mac) + Shift keys together.\n\nIf macOS asks for Accessibility or Input Monitoring, enable the bundled input service as shown by the system, then reopen Mouse Roam.",
    }),
  );
  handle("preview-video", () => {
    if (!cameraReady)
      throw new Error("Choose a capture card and wait for its picture.");
    const wasPaused = paused;
    paused = false;
    showViewer();
    paused = wasPaused;
    previewTimer = setTimeout(hideViewer, 4000);
  });
  ipcMain.on("camera-ready", (event, value) => {
    checkSender(event);
    if (
      event.sender.id !== viewer?.webContents.id ||
      typeof value !== "boolean"
    )
      return;
    const changed = cameraReady !== value;
    cameraReady = value;
    if (!value) release();
    if (changed && value) configure();
    broadcast();
  });
}
function setLogin(enabled) {
  if (process.platform !== "linux") {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return;
  }
  const directory = path.join(app.getPath("home"), ".config", "autostart");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "mouse-roam.desktop");
  if (enabled) {
    const executable = process.env.APPIMAGE || process.execPath;
    const quoted =
      '"' + executable.replace(/[\\"`$]/g, "\\$&").replace(/%/g, "%%") + '"';
    fs.writeFileSync(
      file,
      `[Desktop Entry]\nType=Application\nName=Mouse Roam\nExec=${quoted}\nTerminal=false\n`,
    );
  } else if (fs.existsSync(file)) fs.unlinkSync(file);
}
function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "..", "assets", "trayTemplate.png"))
    .resize({ width: 22, height: 22 });
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Mouse Roam");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Mouse Roam",
        click: () => {
          window.show();
          window.focus();
        },
      },
      { label: "Return to this computer", click: release },
      {
        label: "Pause switching",
        click: () => {
          paused = true;
          engine?.pause();
          hideViewer();
          broadcast();
        },
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => window.show());
}
app.whenReady().then(async () => {
  try {
    store = new Store(
      path.join(app.getPath("userData"), preview ? "preview" : "data"),
    );
    setupIPC();
    session.defaultSession.setPermissionCheckHandler(
      (webContents, permission) =>
        [window?.webContents.id, viewer?.webContents.id].includes(
          webContents?.id,
        ) && permission === "media",
    );
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback, details) =>
        callback(
          [window?.webContents.id, viewer?.webContents.id].includes(
            webContents.id,
          ) &&
            permission === "media" &&
            !details.mediaTypes?.includes("audio"),
        ),
    );
    window = createWindow();
    viewer = createWindow(true);
    createTray();
    viewer.webContents.on("did-finish-load", () =>
      viewer.webContents.send("video", {
        enabled:
          store.data.preferences.role === "main" &&
          store.data.preferences.video,
        camera: store.data.preferences.camera,
      }),
    );
    if (preview) {
      tell("Design preview — no input service, pairing, or computer control.");
      return;
    }
    const binary = path.join(
      app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, "..", "resources"),
      "engine",
      process.platform === "win32" ? "lan-mouse.exe" : "lan-mouse",
    );
    engine = new Engine(store.directory, binary);
    let permissionsReady = false;
    engine.on("state", () => {
      const ready = engine.state.capture && engine.state.emulation;
      if (ready && !permissionsReady) setImmediate(configure);
      permissionsReady = ready;
      broadcast();
    });
    engine.on("fault", (message) => {
      paused = true;
      hideViewer();
      tell(message);
    });
    engine.on("entered", showViewer);
    engine.on("returned", hideViewer);
    await engine.start();
    peers = new Peers(store, engine);
    peers.on("change", broadcast);
    peers.on("notice", tell);
    peers.on("pair-request", () => {
      window.show();
      window.focus();
    });
    peers.on("paired", () => {
      paused = false;
      broadcast();
    });
    peers.on("online", () => {
      setImmediate(configure);
    });
    peers.on("offline", () => {
      engine.pause();
      hideViewer();
      broadcast();
    });
    paused = !store.data.peer;
    await peers.start();
    broadcast();
    powerMonitor.on("suspend", () => {
      engine.pause();
      hideViewer();
    });
    powerMonitor.on("resume", () => {
      peers.online = false;
      engine.retryPermissions();
      peers.tick();
    });
    powerMonitor.on("lock-screen", () => {
      engine.pause();
      hideViewer();
    });
    powerMonitor.on("unlock-screen", () => configure());
  } catch (error) {
    tell(error.message);
    if (!window)
      dialog.showErrorBox("Mouse Roam could not open", error.message);
  }
});
app.on("before-quit", () => {
  quitting = true;
  hideViewer();
  peers?.stop();
  engine?.stop();
});
app.on("activate", () => window?.show());
app.on("window-all-closed", () => {});
