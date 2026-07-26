const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	// File/Folder pickers
	selectFolder: (title) => ipcRenderer.invoke("select-folder", title),
	selectFile: (title, filters) => ipcRenderer.invoke("select-file", title, filters),

	// Download / Convert
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

	// Progress events
	onDownloadProgress: cb => {
		const handler = (_, data) => cb(data);
		ipcRenderer.on("download-progress", handler);
		return () => ipcRenderer.removeListener("download-progress", handler);
	},

	// Locale events
	onLocaleChanged: cb => {
		const handler = (_, locale) => cb(locale);
		ipcRenderer.on("locale-changed", handler);
		return () => ipcRenderer.removeListener("locale-changed", handler);
	},

	// Locale
	getLocale: () => ipcRenderer.invoke("get-locale"),
	setLocale: (locale) => ipcRenderer.invoke("set-locale", locale),
	getAvailableLocales: () => ipcRenderer.invoke("get-available-locales"),

	// External links
	openExternal: (url) => ipcRenderer.invoke("open-external", url),

	// Settings
	getSettings: () => ipcRenderer.invoke("get-settings"),
	saveSettings: (data) => ipcRenderer.invoke("save-settings", data),

	// Clipboard
	getClipboardUrl: () => ipcRenderer.invoke("get-clipboard-url"),

	// Translation
	t: (key, fallback) => ipcRenderer.sendSync("t", key, fallback),
});
