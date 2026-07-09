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
const audioFormatOther = document.getElementById("audioFormatOther");
const audioFormatYoutube = document.getElementById("audioFormatYoutube");
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
const convertMode = document.getElementById("convertMode");
const convertFormat = document.getElementById("convertFormat");
const convertAudioFormat = document.getElementById("convertAudioFormat");
const btnConvertFile = document.getElementById("btnConvertFile");
const btnConvertFolder = document.getElementById("btnConvertFolder");
const btnConvert = document.getElementById("btnConvert");

function setStatus(text, type = "") {
	statusEl.textContent = text;
	statusEl.className = type;
}

function resetUI() {
	setStatus("");
	progressWrap.style.display = "none";
	progressBar.style.width = "0%";
}

function switchTab(activeTab) {
	[tabOther, tabYoutube, tabConvert].forEach(t =>
		t.classList.remove("active")
	);
	[panelOther, panelYoutube, panelConvert].forEach(p =>
		p.classList.remove("active")
	);
	activeTab.classList.add("active");
	const panelId = "panel" + activeTab.id.slice(3);
	document.getElementById(panelId).classList.add("active");
	resetUI();
}

tabOther.addEventListener("click", () => switchTab(tabOther));
tabYoutube.addEventListener("click", () => switchTab(tabYoutube));
tabConvert.addEventListener("click", () => switchTab(tabConvert));

// Mode toggle: show/hide video vs audio format dropdown
convertMode.addEventListener("change", () => {
	const isAudio = convertMode.value === "audio";
	convertFormat.style.display = isAudio ? "none" : "";
	convertAudioFormat.style.display = isAudio ? "" : "none";
	btnConvert.textContent = isAudio ? "Извлечь аудио" : "Конвертировать";
});

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

const removeProgressListener = window.api.onDownloadProgress(data => {
	if (data.stage === "segments" && data.total > 0) {
		progressWrap.style.display = "block";
		progressBar.style.width = (100 * data.current) / data.total + "%";
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

async function doDownload(url, dir, quality, format, audioFormat) {
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
	btnConvert.disabled = true;
	progressWrap.style.display = "none";
	progressBar.style.width = "0%";
	setStatus("Загрузка...");
	try {
		const result = await window.api.download(
			url,
			dir,
			quality,
			format,
			audioFormat
		);
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
	btnConvert.disabled = false;
}

async function doConvert(src, dir) {
	if (!src) {
		setStatus("Выберите исходный файл", "error");
		return;
	}
	if (!dir) {
		setStatus("Выберите папку для сохранения", "error");
		return;
	}
	btnConvert.disabled = true;
	btnDownload.disabled = true;
	btnDownloadYoutube.disabled = true;
	progressWrap.style.display = "none";
	progressBar.style.width = "0%";

	const isAudio = convertMode.value === "audio";
	setStatus(isAudio ? "Извлечение аудио..." : "Конвертация...");
	try {
		const result = isAudio
			? await window.api.extractAudio(src, dir, convertAudioFormat.value)
			: await window.api.convert(src, dir, convertFormat.value);
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
	btnDownload.disabled = false;
	btnDownloadYoutube.disabled = false;
}

btnDownload.addEventListener("click", () => {
	doDownload(
		urlOther.value.trim(),
		dirEl.value.trim(),
		undefined,
		formatOther.value,
		audioFormatOther.value || undefined
	);
});
btnDownloadYoutube.addEventListener("click", () => {
	doDownload(
		urlYoutube.value.trim(),
		dirYoutube.value.trim(),
		qualityEl.value,
		formatYoutube.value,
		audioFormatYoutube.value || undefined
	);
});
btnConvert.addEventListener("click", () => {
	doConvert(convertSrc.value.trim(), convertDir.value.trim());
});
