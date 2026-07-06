const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	selectFolder: () => ipcRenderer.invoke("select-folder"),
	download: (url, dir, quality) => ipcRenderer.invoke("download", { url, dir, quality }),
	onDownloadProgress: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on("download-progress", handler);
		return () => ipcRenderer.removeListener("download-progress", handler);
	},
});
