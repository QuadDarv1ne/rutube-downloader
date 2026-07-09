const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const { runDownload } = require("../src/runDownload");
const { convertFile, extractAudio } = require("../src/convert");
const { isValidFormat, isValidAudioFormat } = require("../src/formats");

let mainWindow = null;
let activeDownload = null;
let activeConvert = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 560,
		height: 560,
		minWidth: 480,
		minHeight: 440,
		title: "Rutube Downloader",
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

ipcMain.handle("select-folder", async () => {
	try {
		const { canceled, filePaths } = await dialog.showOpenDialog(
			mainWindow,
			{
				properties: ["openDirectory"],
				title: "Выберите папку для сохранения",
			}
		);
		if (canceled || !filePaths.length) return null;
		return filePaths[0];
	} catch {
		return null;
	}
});

ipcMain.handle("select-file", async () => {
	try {
		const { canceled, filePaths } = await dialog.showOpenDialog(
			mainWindow,
			{
				properties: ["openFile"],
				title: "Выберите видео-файл",
				filters: [
					{
						name: "Видео",
						extensions: [
							"ts",
							"mp4",
							"mkv",
							"avi",
							"mov",
							"webm",
							"flv",
							"mpg",
							"mpeg",
							"m4v",
							"3gp",
						],
					},
					{ name: "Все файлы", extensions: ["*"] },
				],
			}
		);
		if (canceled || !filePaths.length) return null;
		return filePaths[0];
	} catch {
		return null;
	}
});

ipcMain.handle(
	"download",
	async (_, { url, dir, quality, format, audioFormat }) => {
		if (!url || !dir) throw new Error("Укажите ссылку и папку");
		let parsedUrl;
		try {
			parsedUrl = new URL(url);
		} catch {
			throw new Error("Некорректная ссылка");
		}
		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			throw new Error("Поддерживаются только HTTP/HTTPS ссылки");
		}
		if (format && !isValidFormat(format)) {
			throw new Error("Неподдерживаемый формат: " + format);
		}
		if (audioFormat && !isValidAudioFormat(audioFormat)) {
			throw new Error("Неподдерживаемый аудио-формат: " + audioFormat);
		}
		const sendProgress = data => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("download-progress", data);
			}
		};

		if (activeDownload) {
			throw new Error("Загрузка уже выполняется");
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
					message: `Извлечение аудио: ${path.basename(
						filePath
					)} → ${audioFormat.toUpperCase()}`,
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
				return { ok: false, error: "Загрузка отменена" };
			}
			return { ok: false, error: e.message };
		} finally {
			if (activeDownload === controller) activeDownload = null;
		}
	}
);

ipcMain.handle("convert", async (_, { src, dir, format }) => {
	if (!src || !dir) throw new Error("Укажите исходный файл и папку");
	if (!isValidFormat(format)) {
		throw new Error("Неподдерживаемый формат: " + format);
	}
	if (activeConvert) {
		throw new Error("Операция уже выполняется");
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
			return { ok: false, error: "Операция отменена" };
		}
		return { ok: false, error: e.message };
	} finally {
		if (activeConvert === controller) activeConvert = null;
	}
});

ipcMain.handle("extract-audio", async (_, { src, dir, format }) => {
	if (!src || !dir) throw new Error("Укажите исходный файл и папку");
	if (!isValidAudioFormat(format)) {
		throw new Error("Неподдерживаемый аудио-формат: " + format);
	}
	if (activeConvert) {
		throw new Error("Операция уже выполняется");
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
			return { ok: false, error: "Операция отменена" };
		}
		return { ok: false, error: e.message };
	} finally {
		if (activeConvert === controller) activeConvert = null;
	}
});
