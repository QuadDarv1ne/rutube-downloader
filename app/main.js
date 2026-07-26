const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { runDownload } = require("../src/runDownload");
const { convertFile, extractAudio } = require("../src/convert");
const { isValidFormat, isValidAudioFormat } = require("../src/formats");
const i18n = require("../src/i18n");
const { configure } = require("../src/configure");

let crashLogPath = "";

function logCrash(label, err) {
	const msg = `[${new Date().toISOString()}] ${label}: ${err?.message || err}\n${err?.stack || ""}\n\n`;
	try { fs.appendFileSync(crashLogPath, msg); } catch {}
	console.error(msg);
}

process.on("uncaughtException", err => { logCrash("uncaughtException", err); });
process.on("unhandledRejection", err => { logCrash("unhandledRejection", err); });

let mainWindow = null;
let activeDownload = null;
let activeConvert = null;

// --- Application Menu ---

function buildMenu() {
	const currentLocale = i18n.getLocale();
	const locales = i18n.getAvailableLocales();

	const languageSubmenu = locales.map(loc => ({
		label: i18n.t("menu.lang." + loc),
		type: "radio",
		checked: currentLocale === loc,
		click: () => {
			i18n.setLocale(loc);
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.setTitle(i18n.t("app.title"));
				mainWindow.webContents.send("locale-changed", loc);
			}
			buildMenu();
		},
	}));

	const parallelOptions = [1, 2, 3, 4, 5, 8, 10];
	const parallelSubmenu = parallelOptions.map(n => ({
		label: `${n} ${i18n.t("menu.settings.parallelCount")}`,
		type: "radio",
		checked: configure.downloadParallel === n,
		click: () => {
			configure.downloadParallel = n;
			buildMenu();
		},
	}));

	const menuTemplate = [
		{
			label: i18n.t("menu.file"),
			submenu: [
				{
					label: i18n.t("menu.file.exit"),
					accelerator: "CmdOrCtrl+Q",
					click: () => app.quit(),
				},
			],
		},
		{
			label: i18n.t("menu.settings"),
			submenu: [
				{
					label: i18n.t("menu.settings.language"),
					submenu: languageSubmenu,
				},
				{ type: "separator" },
				{
					label: i18n.t("menu.settings.parallel"),
					submenu: parallelSubmenu,
				},
			],
		},
		{
			label: i18n.t("menu.help"),
			submenu: [
				{
					label: i18n.t("menu.help.about"),
					click: () => {
						dialog.showMessageBox(mainWindow, {
							type: "info",
							title: i18n.t("app.heading"),
							message: i18n.t("app.heading"),
							detail: `v${require("../package.json").version}\n\n${i18n.t("app.heading")} \u2014 ${i18n.t("menu.help.about").toLowerCase()}\nElectron ${process.versions.electron}\nNode ${process.versions.node}\nChromium ${process.versions.chrome}`,
						});
					},
				},
				{
					label: i18n.t("menu.help.github"),
					click: () => shell.openExternal("https://github.com/QuadDarv1ne/rutube-downloader"),
				},
				{
					label: i18n.t("menu.help.report"),
					click: () => shell.openExternal("https://github.com/QuadDarv1ne/rutube-downloader/issues"),
				},
			],
		},
	];

	Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// --- Window ---

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

app.disableHardwareAcceleration();

app.whenReady().then(() => {
	crashLogPath = path.join(app.getPath("userData"), "crash.log");
	buildMenu();
	createWindow();
});
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("child-process-gone", (event, details) => {
	logCrash(`child-process-gone (${details.type}, reason=${details.reason})`, details.error);
});

// --- IPC ---

ipcMain.handle("get-locale", () => i18n.getLocale());
ipcMain.handle("set-locale", (_, locale) => {
	i18n.setLocale(locale);
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.setTitle(i18n.t("app.title"));
	}
	buildMenu();
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
					sendProgress,
					controller.signal
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
		const filePath = await convertFile(src, dir, format, sendProgress, controller.signal);
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
		const filePath = await extractAudio(src, dir, format, sendProgress, controller.signal);
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
