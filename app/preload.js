const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	selectFolder: () => ipcRenderer.invoke("select-folder"),
	selectFile: () => ipcRenderer.invoke("select-file"),
	download: (url, dir, quality, format) => ipcRenderer.invoke("download", { url, dir, quality, format }),
	convert: (src, dir, format) => ipcRenderer.invoke("convert", { src, dir, format }),
	onDownloadProgress: (cb) => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on("download-progress", handler);
		return () => ipcRenderer.removeListener("download-progress", handler);
	},
});
