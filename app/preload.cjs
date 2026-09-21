"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("mouseRoam", {
  state: () => ipcRenderer.invoke("state"),
  save: (preferences) => ipcRenderer.invoke("save", preferences),
  pair: (id) => ipcRenderer.invoke("pair", id),
  confirm: () => ipcRenderer.invoke("confirm"),
  cancel: () => ipcRenderer.invoke("cancel"),
  forget: () => ipcRenderer.invoke("forget"),
  pause: () => ipcRenderer.invoke("pause"),
  resume: () => ipcRenderer.invoke("resume"),
  permissions: () => ipcRenderer.invoke("permissions"),
  help: () => ipcRenderer.invoke("help"),
  previewVideo: () => ipcRenderer.invoke("preview-video"),
  cameraReady: (value) => ipcRenderer.send("camera-ready", value),
  onState: (callback) => {
    const handler = (_, state) => callback(state);
    ipcRenderer.on("state", handler);
    return () => ipcRenderer.removeListener("state", handler);
  },
  onVideo: (callback) => ipcRenderer.on("video", (_, value) => callback(value)),
});
