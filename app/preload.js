const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	selectFolder: (title) => ipcRenderer.invoke("select-folder", title),
	selectFile: (title, filters) => ipcRenderer.invoke("select-file", title, filters),
	download: (url, dir, quality, format, audioFormat) =>
		ipcRenderer.invoke("download", {
			url,
			dir,
			quality,
			format,
			audioFormat,
		}),
	convert: (src, dir, format) =>
		ipcRenderer.invoke("convert", { src, dir, format }),
	extractAudio: (src, dir, format) =>
		ipcRenderer.invoke("extract-audio", { src, dir, format }),
	onDownloadProgress: cb => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on("download-progress", handler);
		return () => ipcRenderer.removeListener("download-progress", handler);
	},
	onLocaleChanged: cb => {
		const handler = (_, locale) => cb(locale);
		ipcRenderer.on("locale-changed", handler);
		return () => ipcRenderer.removeListener("locale-changed", handler);
	},
	getLocale: () => ipcRenderer.invoke("get-locale"),
	setLocale: (locale) => ipcRenderer.invoke("set-locale", locale),
	getAvailableLocales: () => ipcRenderer.invoke("get-available-locales"),
	t: (key, fallback) => ipcRenderer.sendSync("t", key, fallback),
});
