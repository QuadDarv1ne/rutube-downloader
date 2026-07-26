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

// Language selector
const langSelect = document.getElementById("langSelect");

let isDownloading = false;

// --- i18n ---
function tr(key, fallback) {
	return window.api.t(key, fallback);
}

function applyConvertModeButton() {
	const isAudio = convertMode.value === "audio";
	btnConvert.textContent = isAudio
		? tr("btn.extractAudio")
		: tr("btn.convert");
	convertFormat.style.display = isAudio ? "none" : "";
	convertAudioFormat.style.display = isAudio ? "" : "none";
}

async function applyTranslations() {
	document.querySelectorAll("[data-i18n]").forEach(el => {
		const key = el.getAttribute("data-i18n");
		el.textContent = tr(key);
	});
	document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
		const key = el.getAttribute("data-i18n-placeholder");
		el.placeholder = tr(key);
	});
	document.title = tr("app.title");
	document.documentElement.lang = localStorage.getItem("locale") || "ru";
	applyConvertModeButton();
}

async function initLocale() {
	const saved = localStorage.getItem("locale") || "ru";
	langSelect.value = saved;
	await window.api.setLocale(saved);
	await applyTranslations();
}

// --- Settings persistence ---

async function loadSettings() {
	try {
		const settings = await window.api.getSettings();
		if (settings.lastFolder) {
			dirEl.value = settings.lastFolder;
			dirYoutube.value = settings.lastFolder;
			convertDir.value = settings.lastFolder;
		}
		if (settings.defaultFormat) {
			formatOther.value = settings.defaultFormat;
			formatYoutube.value = settings.defaultFormat;
		}
		if (settings.defaultAudioFormat) {
			audioFormatOther.value = settings.defaultAudioFormat;
			audioFormatYoutube.value = settings.defaultAudioFormat;
		}
	} catch {}
}

async function saveCurrentSettings() {
	await window.api.saveSettings({
		lastFolder: dirEl.value.trim() || "",
		defaultFormat: formatOther.value,
		defaultAudioFormat: audioFormatOther.value,
	});
}

// --- Clipboard auto-detect ---

function checkClipboard() {
	window.api.getClipboardUrl().then(url => {
		if (url) {
			const activePanel = document.querySelector(".panel.active");
			if (activePanel && activePanel.id === "panelOther" && !urlOther.value.trim()) {
				urlOther.value = url;
			} else if (activePanel && activePanel.id === "panelYoutube" && !urlYoutube.value.trim()) {
				urlYoutube.value = url;
			}
		}
	});
}

// --- Locale ---

langSelect.addEventListener("change", async () => {
	const locale = langSelect.value;
	localStorage.setItem("locale", locale);
	await window.api.setLocale(locale);
	await applyTranslations();
});

window.api.onLocaleChanged(locale => {
	localStorage.setItem("locale", locale);
	langSelect.value = locale;
	applyTranslations();
});

// --- UI helpers ---
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
	[tabOther, tabYoutube, tabConvert].forEach(tab =>
		tab.classList.remove("active")
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
convertMode.addEventListener("change", applyConvertModeButton);

btnFolder.addEventListener("click", async () => {
	const p = await window.api.selectFolder();
	if (p) {
		dirEl.value = p;
		dirYoutube.value = p;
		convertDir.value = p;
		await saveCurrentSettings().catch(() => {});
	}
});
btnFolderYoutube.addEventListener("click", async () => {
	const p = await window.api.selectFolder();
	if (p) {
		dirYoutube.value = p;
		dirEl.value = p;
		convertDir.value = p;
		await saveCurrentSettings().catch(() => {});
	}
});
btnConvertFolder.addEventListener("click", async () => {
	const p = await window.api.selectFolder();
	if (p) {
		convertDir.value = p;
		dirEl.value = p;
		dirYoutube.value = p;
		await saveCurrentSettings().catch(() => {});
	}
});
btnConvertFile.addEventListener("click", async () => {
	const file = await window.api.selectFile();
	if (file) convertSrc.value = file;
});

// Save settings on format change
formatOther.addEventListener("change", () => saveCurrentSettings().catch(() => {}));
audioFormatOther.addEventListener("change", () => saveCurrentSettings().catch(() => {}));

window.api.onDownloadProgress(data => {
	if (data.stage === "segments" && data.total > 0) {
		progressWrap.style.display = "block";
		progressBar.style.width = (100 * data.current) / data.total + "%";
		setStatus(tr("status.segments") + data.current + " / " + data.total);
	} else if (data.stage === "download" && data.message) {
		progressWrap.style.display = "block";
		setStatus(data.message);
	} else if (data.stage === "merge") {
		setStatus(tr("status.merging"));
	} else if (data.stage === "convert" && data.message) {
		progressWrap.style.display = "block";
		setStatus(data.message);
	} else if (data.stage === "convert") {
		setStatus(tr("status.converting"));
	} else if (data.stage === "done" && data.filePath) {
		progressWrap.style.display = "none";
		progressBar.style.width = "0%";
		setStatus(tr("status.done") + "\n" + data.filePath, "success");
		isDownloading = false;
	} else if (data.stage === "error" && data.message) {
		progressWrap.style.display = "none";
		progressBar.style.width = "0%";
		setStatus(data.message, "error");
		isDownloading = false;
	}
});

async function doDownload(url, dir, quality, format, audioFormat) {
	if (!url) {
		setStatus(tr("validation.enterUrl"), "error");
		return;
	}
	if (!dir) {
		setStatus(tr("validation.selectFolder"), "error");
		return;
	}
	isDownloading = true;
	btnDownload.disabled = true;
	btnDownloadYoutube.disabled = true;
	btnConvert.disabled = true;
	progressWrap.style.display = "none";
	progressBar.style.width = "0%";
	setStatus(tr("status.loading"));
	try {
		const result = await window.api.download(
			url,
			dir,
			quality,
			format,
			audioFormat
		);
		if (result.ok) {
			setStatus(tr("status.done") + "\n" + result.filePath, "success");
		} else {
			progressWrap.style.display = "none";
			progressBar.style.width = "0%";
			setStatus(result.error, "error");
		}
	} catch (e) {
		progressWrap.style.display = "none";
		progressBar.style.width = "0%";
		setStatus(e.message || tr("status.error"), "error");
	}
	isDownloading = false;
	btnDownload.disabled = false;
	btnDownloadYoutube.disabled = false;
	btnConvert.disabled = false;
}

async function doConvert(src, dir) {
	if (!src) {
		setStatus(tr("validation.selectFile"), "error");
		return;
	}
	if (!dir) {
		setStatus(tr("validation.selectFolder"), "error");
		return;
	}
	btnConvert.disabled = true;
	btnDownload.disabled = true;
	btnDownloadYoutube.disabled = true;
	progressWrap.style.display = "none";
	progressBar.style.width = "0%";

	const isAudio = convertMode.value === "audio";
	setStatus(isAudio ? tr("status.extractingAudio") : tr("status.converting"));
	try {
		const result = isAudio
			? await window.api.extractAudio(src, dir, convertAudioFormat.value)
			: await window.api.convert(src, dir, convertFormat.value);
		if (result.ok) {
			setStatus(tr("status.done") + "\n" + result.filePath, "success");
		} else {
			progressWrap.style.display = "none";
			progressBar.style.width = "0%";
			setStatus(result.error, "error");
		}
	} catch (e) {
		progressWrap.style.display = "none";
		progressBar.style.width = "0%";
		setStatus(e.message || tr("status.error"), "error");
	}
	btnConvert.disabled = false;
	btnDownload.disabled = false;
	btnDownloadYoutube.disabled = false;
}

function triggerDownload() {
	const activePanel = document.querySelector(".panel.active");
	if (activePanel && activePanel.id === "panelYoutube") {
		btnDownloadYoutube.click();
	} else {
		btnDownload.click();
	}
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

// --- Keyboard shortcuts ---

document.addEventListener("keydown", e => {
	// Ctrl+Enter / Cmd+Enter - start download
	if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
		e.preventDefault();
		if (!isDownloading) triggerDownload();
	}
	// Ctrl+V - paste URL from clipboard
	if ((e.ctrlKey || e.metaKey) && e.key === "v") {
		// Let native paste work, but also detect URL
		setTimeout(checkClipboard, 100);
	}
	// Escape - cancel download
	if (e.key === "Escape" && isDownloading) {
		window.api.cancelDownload();
	}
});

// --- Focus: auto-detect clipboard URL ---
window.addEventListener("focus", () => {
	setTimeout(checkClipboard, 200);
});

// --- Init ---
initLocale();
loadSettings();

// Open external links in system browser
document.addEventListener("click", e => {
	const link = e.target.closest("a[href]");
	if (link && link.hostname && link.hostname !== location.hostname) {
		e.preventDefault();
		window.api.openExternal(link.href);
	}
});
