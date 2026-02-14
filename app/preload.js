const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	selectFolder: () => ipcRenderer.invoke("select-folder"),
	download: (url, dir, quality) => ipcRenderer.invoke("download", { url, dir, quality }),
	onDownloadProgress: (cb) => {
		ipcRenderer.on("download-progress", (_, data) => cb(data));
	},
});
