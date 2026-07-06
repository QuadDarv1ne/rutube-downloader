const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const { runDownload } = require("../src/runDownload");

let mainWindow = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 560,
		height: 500,
		minWidth: 480,
		minHeight: 400,
		title: "Rutube Downloader",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	mainWindow.loadFile(path.join(__dirname, "index.html"));
	mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

ipcMain.handle("select-folder", async () => {
	const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
		properties: ["openDirectory"],
		title: "Выберите папку для сохранения",
	});
	if (canceled || !filePaths.length) return null;
	return filePaths[0];
});

ipcMain.handle("download", async (_, { url, dir, quality }) => {
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
	const sendProgress = (data) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("download-progress", data);
		}
	};
	try {
		const filePath = await runDownload(url, dir, { onProgress: sendProgress, quality });
		sendProgress({ stage: "done", filePath });
		return { ok: true, filePath };
	} catch (e) {
		return { ok: false, error: e.message };
	}
});
