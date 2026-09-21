"use strict";
const api = window.edgeSwitch;
const $ = (id) => document.getElementById(id);
let current,
  initialized = false,
  busy = false,
  stream,
  lastVideo,
  videoVersion = 0;
const overlay = new URLSearchParams(location.search).get("view") === "video";
if (overlay) {
  document.body.className = "video";
  $("setup").hidden = true;
  $("video-view").hidden = false;
}
async function call(name, ...args) {
  const result = await api[name](...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function error(message) {
  $("notice").textContent = message;
  $("notice").hidden = false;
}
function prefs() {
  return {
    role: document.querySelector('input[name="role"]:checked').value,
    side: $("side").value,
    video: $("video-enabled").checked,
    camera: $("camera").value,
    startAtLogin: $("login").checked,
  };
}
function updateForm() {
  const main = prefs().role === "main";
  $("video-step").hidden = !main;
  $("capture-options").hidden = !$("video-enabled").checked;
}
async function save() {
  updateForm();
  try {
    await call("save", prefs());
  } catch (e) {
    error(e.message);
  }
}
function render(s) {
  current = s;
  if (overlay) return;
  if (!initialized && s.preferences) {
    const p = s.preferences;
    document.querySelector(`input[name="role"][value="${p.role}"]`).checked =
      true;
    $("side").value = p.side;
    $("video-enabled").checked = p.video;
    $("login").checked = p.startAtLogin;
    if (p.camera) {
      const option = new Option("Saved capture card", p.camera);
      $("camera").add(option);
      $("camera").value = p.camera;
    }
    initialized = true;
    updateForm();
  }
  $("local-icon").textContent =
    s.platform === "darwin" ? "⌘" : s.platform === "win32" ? "⊞" : "◈";
  $("remote-icon").textContent = s.peer
    ? s.peer.platform === "darwin"
      ? "⌘"
      : s.peer.platform === "win32"
        ? "⊞"
        : "◈"
    : "+";
  $("peer-name").textContent = s.peer?.name || "Your other computer";
  $("connection-label").textContent = s.network.online
    ? s.paused
      ? "Connected · paused"
      : "Connected"
    : s.peer
      ? "Waiting for other computer"
      : "Let’s connect";
  $("notice").textContent = s.notice || "";
  $("notice").hidden = !s.notice;
  const pairing = s.network.pairing;
  $("pairing").hidden = !pairing;
  if (pairing) {
    $("pair-title").textContent = `Pair with ${pairing.name}?`;
    $("pair-code").textContent = pairing.code;
    $("confirm").disabled = pairing.accepted;
    $("pair-wait").hidden = !pairing.accepted;
  }
  $("paired-actions").hidden = !s.peer;
  $("nearby").hidden = !!s.peer;
  document
    .querySelectorAll('input[name="role"]')
    .forEach((input) => (input.disabled = !!s.peer || !!pairing));
  if (!s.peer) {
    $("nearby").replaceChildren();
    if (!s.network.nearby.length) {
      const span = document.createElement("span");
      span.className = "searching";
      span.textContent = s.preview
        ? "Nearby computers appear here when the app is running."
        : "Looking for your other computer…";
      $("nearby").append(span);
    }
    for (const peer of s.network.nearby) {
      const button = document.createElement("button");
      button.className = "secondary";
      button.textContent = `Connect to ${peer.name}`;
      button.disabled = !!pairing || busy;
      button.onclick = () =>
        perform(async () => {
          await call("pair", peer.id);
        });
      $("nearby").append(button);
    }
  }
  const permissionReady =
    s.engine.running &&
    s.engine.emulation &&
    (s.preferences.role !== "main" || s.engine.capture);
  $("engine-status").textContent = s.preview
    ? "Design preview"
    : !s.engine.running
      ? "Input service unavailable"
      : !permissionReady
        ? "Permissions need attention"
        : "Input service ready";
  $("camera-status").textContent = s.cameraReady
    ? "✓ Capture picture is ready."
    : "Choose the capture card, not your webcam.";
  $("test-video").disabled = !s.cameraReady;
  const ready =
    s.peer &&
    s.network.online &&
    permissionReady &&
    (s.preferences.role !== "main" || !s.preferences.video || s.cameraReady);
  $("start").disabled = busy || !ready;
  $("start").textContent = !s.peer
    ? "Connect a computer first"
    : !s.network.online
      ? "Waiting for other computer"
      : !permissionReady
        ? "Allow permissions first"
        : s.preferences.role === "main" && s.preferences.video && !s.cameraReady
          ? "Choose a capture card"
          : s.paused
            ? "Start switching"
            : "Pause switching";
}
async function perform(fn) {
  busy = true;
  try {
    await fn();
  } catch (e) {
    error(e.message);
  } finally {
    busy = false;
  }
}
async function findCamera() {
  const temporary = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  temporary.getTracks().forEach((track) => track.stop());
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === "videoinput",
  );
  const previous = $("camera").value;
  $("camera").replaceChildren(new Option("Choose your capture card", ""));
  devices.forEach((d, i) =>
    $("camera").add(new Option(d.label || `Video device ${i + 1}`, d.deviceId)),
  );
  if (devices.some((d) => d.deviceId === previous))
    $("camera").value = previous;
  else {
    const cards = devices.filter((d) =>
      /capture|elgato|hdmi|cam link|uvc/i.test(d.label),
    );
    if (cards.length === 1) {
      $("camera").value = cards[0].deviceId;
      await save();
    }
  }
  if (!devices.length)
    throw new Error(
      "No video devices found. Connect the capture card’s USB cable and try again.",
    );
}
async function video(value) {
  if (!overlay) return;
  lastVideo = value;
  const version = ++videoVersion;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  api.cameraReady(false);
  $("video-error").hidden = false;
  if (!value.enabled || !value.camera) {
    $("video-error").textContent = "Choose a capture card in Edge Switch.";
    return;
  }
  try {
    const next = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: value.camera },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 },
      },
      audio: false,
    });
    if (version !== videoVersion) {
      next.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = next;
    $("capture-video").srcObject = stream;
    await $("capture-video").play();
    $("video-error").hidden = true;
    api.cameraReady(true);
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      stream = null;
      api.cameraReady(false);
      $("video-error").hidden = false;
      $("video-error").textContent = "Capture card disconnected.";
    });
  } catch (e) {
    api.cameraReady(false);
    $("video-error").textContent =
      "Could not open the capture card. Reconnect it and check camera permissions.";
  }
}
if (api) {
  if (overlay)
    navigator.mediaDevices.addEventListener("devicechange", () => {
      if (!stream && lastVideo?.enabled && lastVideo.camera) video(lastVideo);
    });
  api.onState(render);
  api.onVideo(video);
  call("state")
    .then(render)
    .catch((e) => error(e.message));
  if (!overlay) {
    document
      .querySelectorAll('input[name="role"]')
      .forEach((input) => input.addEventListener("change", save));
    for (const id of ["side", "video-enabled", "camera", "login"])
      $(id).addEventListener("change", save);
    $("find-camera").onclick = () => perform(findCamera);
    $("test-video").onclick = () => perform(() => call("previewVideo"));
    $("confirm").onclick = () => perform(() => call("confirm"));
    $("cancel").onclick = () => perform(() => call("cancel"));
    $("forget").onclick = () => perform(() => call("forget"));
    $("start").onclick = () =>
      perform(() => call(current.paused ? "resume" : "pause"));
    $("permissions").onclick = () => perform(() => call("permissions"));
    $("help").onclick = () => perform(() => call("help"));
  }
} else error("Open this screen in the Edge Switch app.");
