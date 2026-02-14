const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	selectFolder: () => ipcRenderer.invoke("select-folder"),
	download: (url, dir) => ipcRenderer.invoke("download", { url, dir }),
	onDownloadProgress: (cb) => {
		ipcRenderer.on("download-progress", (_, data) => cb(data));
	},
});
