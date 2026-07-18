const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const { runDownload } = require("../src/runDownload");
const { convertFile, extractAudio } = require("../src/convert");
const { isValidFormat, isValidAudioFormat } = require("../src/formats");
const i18n = require("../src/i18n");

let mainWindow = null;
let activeDownload = null;
let activeConvert = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 560,
		height: 600,
		minWidth: 480,
		minHeight: 440,
		title: i18n.t("app.title"),
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	mainWindow.loadFile(path.join(__dirname, "index.html"));
	mainWindow.on("closed", () => {
		mainWindow = null;
		if (activeDownload) {
			activeDownload.abort();
			activeDownload = null;
		}
		if (activeConvert) {
			activeConvert.abort();
			activeConvert = null;
		}
	});
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("get-locale", () => i18n.getLocale());
ipcMain.handle("set-locale", (_, locale) => {
	i18n.setLocale(locale);
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.setTitle(i18n.t("app.title"));
	}
	return i18n.getLocale();
});
ipcMain.handle("get-available-locales", () => i18n.getAvailableLocales());

ipcMain.on("t", (event, key, fallback) => {
	event.returnValue = i18n.t(key, fallback);
});

ipcMain.handle("select-folder", async (_, title) => {
	try {
		const { canceled, filePaths } = await dialog.showOpenDialog(
			mainWindow,
			{
				properties: ["openDirectory"],
				title: title || i18n.t("dialog.selectFolder"),
			}
		);
		if (canceled || !filePaths.length) return null;
		return filePaths[0];
	} catch (e) {
		console.error(e);
		return null;
	}
});

ipcMain.handle("select-file", async (_, title, filters) => {
	try {
		const videoFilters = [
			{
				name: i18n.t("dialog.filterVideo"),
				extensions: [
					"ts", "mp4", "mkv", "avi", "mov", "webm",
					"flv", "mpg", "mpeg", "m4v", "3gp",
				],
			},
			{ name: i18n.t("dialog.filterAll"), extensions: ["*"] },
		];
		const { canceled, filePaths } = await dialog.showOpenDialog(
			mainWindow,
			{
				properties: ["openFile"],
				title: title || i18n.t("dialog.selectFile"),
				filters: filters || videoFilters,
			}
		);
		if (canceled || !filePaths.length) return null;
		return filePaths[0];
	} catch (e) {
		console.error(e);
		return null;
	}
});

ipcMain.handle(
	"download",
	async (_, { url, dir, quality, format, audioFormat }) => {
		if (!url || !dir) throw new Error(i18n.t("error.specifyUrlAndFolder"));
		let parsedUrl;
		try {
			parsedUrl = new URL(url);
		} catch {
			throw new Error(i18n.t("error.invalidUrl"));
		}
		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			throw new Error(i18n.t("error.onlyHttp"));
		}
		if (format && !isValidFormat(format)) {
			throw new Error(i18n.t("error.unsupportedFormat") + format);
		}
		if (audioFormat && !isValidAudioFormat(audioFormat)) {
			throw new Error(i18n.t("error.unsupportedAudioFormat") + audioFormat);
		}
		const sendProgress = data => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("download-progress", data);
			}
		};

		if (activeDownload) {
			throw new Error(i18n.t("error.alreadyDownloading"));
		}

		const controller = new AbortController();
		activeDownload = controller;
		try {
			const filePath = await runDownload(url, dir, {
				onProgress: sendProgress,
				quality,
				format,
				signal: controller.signal,
			});
			if (audioFormat) {
				sendProgress({
					stage: "convert",
					message: i18n.t("cli.extractingAudio") + path.basename(filePath) + " \u2192 " + audioFormat.toUpperCase(),
				});
				const audioPath = await extractAudio(
					filePath,
					dir,
					audioFormat,
					sendProgress
				);
				sendProgress({ stage: "done", filePath: audioPath });
				return { ok: true, filePath: audioPath };
			}
			sendProgress({ stage: "done", filePath });
			return { ok: true, filePath };
		} catch (e) {
			if (controller.signal.aborted) {
				return { ok: false, error: i18n.t("error.downloadCancelled") };
			}
			return { ok: false, error: e.message };
		} finally {
			if (activeDownload === controller) activeDownload = null;
		}
	}
);

ipcMain.handle("convert", async (_, { src, dir, format }) => {
	if (!src || !dir) throw new Error(i18n.t("error.specifySourceAndFolder"));
	if (!isValidFormat(format)) {
		throw new Error(i18n.t("error.unsupportedFormat") + format);
	}
	if (activeConvert) {
		throw new Error(i18n.t("error.alreadyConverting"));
	}
	const sendProgress = data => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("download-progress", data);
		}
	};
	const controller = new AbortController();
	activeConvert = controller;
	try {
		const filePath = await convertFile(src, dir, format, sendProgress);
		sendProgress({ stage: "done", filePath });
		return { ok: true, filePath };
	} catch (e) {
		if (controller.signal.aborted) {
			return { ok: false, error: i18n.t("error.cancelled") };
		}
		return { ok: false, error: e.message };
	} finally {
		if (activeConvert === controller) activeConvert = null;
	}
});

ipcMain.handle("extract-audio", async (_, { src, dir, format }) => {
	if (!src || !dir) throw new Error(i18n.t("error.specifySourceAndFolder"));
	if (!isValidAudioFormat(format)) {
		throw new Error(i18n.t("error.unsupportedAudioFormat") + format);
	}
	if (activeConvert) {
		throw new Error(i18n.t("error.alreadyConverting"));
	}
	const sendProgress = data => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("download-progress", data);
		}
	};
	const controller = new AbortController();
	activeConvert = controller;
	try {
		const filePath = await extractAudio(src, dir, format, sendProgress);
		sendProgress({ stage: "done", filePath });
		return { ok: true, filePath };
	} catch (e) {
		if (controller.signal.aborted) {
			return { ok: false, error: i18n.t("error.cancelled") };
		}
		return { ok: false, error: e.message };
	} finally {
		if (activeConvert === controller) activeConvert = null;
	}
});
