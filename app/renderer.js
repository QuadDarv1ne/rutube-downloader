const tabOther = document.getElementById("tabOther");
const tabYoutube = document.getElementById("tabYoutube");
const tabConvert = document.getElementById("tabConvert");
const panelOther = document.getElementById("panelOther");
const panelYoutube = document.getElementById("panelYoutube");
const panelConvert = document.getElementById("panelConvert");
const urlOther = document.getElementById("urlOther");
const urlYoutube = document.getElementById("urlYoutube");
const dirEl = document.getElementById("dir");
const dirYoutube = document.getElementById("dirYoutube");
const formatOther = document.getElementById("formatOther");
const formatYoutube = document.getElementById("formatYoutube");
const qualityEl = document.getElementById("quality");
const btnFolder = document.getElementById("btnFolder");
const btnFolderYoutube = document.getElementById("btnFolderYoutube");
const btnDownload = document.getElementById("btnDownload");
const btnDownloadYoutube = document.getElementById("btnDownloadYoutube");
const statusEl = document.getElementById("status");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");

// Convert tab elements
const convertSrc = document.getElementById("convertSrc");
const convertDir = document.getElementById("convertDir");
const convertFormat = document.getElementById("convertFormat");
const btnConvertFile = document.getElementById("btnConvertFile");
const btnConvertFolder = document.getElementById("btnConvertFolder");
const btnConvert = document.getElementById("btnConvert");

function setStatus(text, type = "") {
	statusEl.textContent = text;
	statusEl.className = type;
}

function switchTab(activeTab) {
	[tabOther, tabYoutube, tabConvert].forEach(t => t.classList.remove("active"));
	[panelOther, panelYoutube, panelConvert].forEach(p => p.classList.remove("active"));
	activeTab.classList.add("active");
	const panelId = "panel" + activeTab.id.slice(3);
	document.getElementById(panelId).classList.add("active");
}

tabOther.addEventListener("click", () => switchTab(tabOther));
tabYoutube.addEventListener("click", () => switchTab(tabYoutube));
tabConvert.addEventListener("click", () => switchTab(tabConvert));

btnFolder.addEventListener("click", async () => {
	const path = await window.api.selectFolder();
	if (path) dirEl.value = path;
});
btnFolderYoutube.addEventListener("click", async () => {
	const path = await window.api.selectFolder();
	if (path) dirYoutube.value = path;
});
btnConvertFolder.addEventListener("click", async () => {
	const path = await window.api.selectFolder();
	if (path) convertDir.value = path;
});
btnConvertFile.addEventListener("click", async () => {
	const file = await window.api.selectFile();
	if (file) convertSrc.value = file;
});

const removeProgressListener = window.api.onDownloadProgress((data) => {
	if (data.stage === "segments" && data.total > 0) {
		progressWrap.style.display = "block";
		progressBar.style.width = (100 * data.current / data.total) + "%";
		setStatus("Сегменты: " + data.current + " / " + data.total);
	} else if (data.stage === "download" && data.message) {
		progressWrap.style.display = "block";
		setStatus(data.message);
	} else if (data.stage === "merge") {
		setStatus("Объединение файлов...");
	} else if (data.stage === "convert" && data.message) {
		progressWrap.style.display = "block";
		setStatus(data.message);
	} else if (data.stage === "convert") {
		setStatus("Конвертация...");
	} else if (data.stage === "done" && data.filePath) {
		progressWrap.style.display = "none";
		progressBar.style.width = "0%";
		setStatus("Готово!\n" + data.filePath, "success");
	} else if (data.stage === "error" && data.message) {
		progressWrap.style.display = "none";
		progressBar.style.width = "0%";
		setStatus(data.message, "error");
	}
});

async function doDownload(url, dir, quality, format) {
	if (!url) {
		setStatus("Введите ссылку на видео", "error");
		return;
	}
	if (!dir) {
		setStatus("Выберите папку для сохранения", "error");
		return;
	}
	btnDownload.disabled = true;
	btnDownloadYoutube.disabled = true;
	progressWrap.style.display = "none";
	progressBar.style.width = "0%";
	setStatus("Загрузка...");
	try {
		const result = await window.api.download(url, dir, quality, format);
		if (result.ok) {
			setStatus("Готово!\n" + result.filePath, "success");
		} else {
			progressWrap.style.display = "none";
			progressBar.style.width = "0%";
			setStatus(result.error, "error");
		}
	} catch (e) {
		progressWrap.style.display = "none";
		progressBar.style.width = "0%";
		setStatus(e.message || "Ошибка", "error");
	}
	btnDownload.disabled = false;
	btnDownloadYoutube.disabled = false;
}

async function doConvert(src, dir, format) {
	if (!src) {
		setStatus("Выберите исходный файл", "error");
		return;
	}
	if (!dir) {
		setStatus("Выберите папку для сохранения", "error");
		return;
	}
	btnConvert.disabled = true;
	progressWrap.style.display = "none";
	progressBar.style.width = "0%";
	setStatus("Конвертация...");
	try {
		const result = await window.api.convert(src, dir, format);
		if (result.ok) {
			setStatus("Готово!\n" + result.filePath, "success");
		} else {
			progressWrap.style.display = "none";
			progressBar.style.width = "0%";
			setStatus(result.error, "error");
		}
	} catch (e) {
		progressWrap.style.display = "none";
		progressBar.style.width = "0%";
		setStatus(e.message || "Ошибка", "error");
	}
	btnConvert.disabled = false;
}

btnDownload.addEventListener("click", () => {
	doDownload(urlOther.value.trim(), dirEl.value.trim(), undefined, formatOther.value);
});
btnDownloadYoutube.addEventListener("click", () => {
	doDownload(urlYoutube.value.trim(), dirYoutube.value.trim(), qualityEl.value, formatYoutube.value);
});
btnConvert.addEventListener("click", () => {
	doConvert(convertSrc.value.trim(), convertDir.value.trim(), convertFormat.value);
});
