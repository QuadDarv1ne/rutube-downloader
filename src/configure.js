const fs = require("node:fs");
const path = require("node:path");

exports.configure = {
	barSize:        25,
	padText:        16,
	padLine:        20,
	padCodecs:      10,
	padEndText:     21,
	videoDir:       "video",
	downloadParallel: 5,
	lastFolder:     "",
	defaultFormat:  "mp4",
	defaultAudioFormat: "",
	browserHeaders:  {
		accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
		"accept-encoding": "gzip, deflate",
		"sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
		"sec-ch-ua-mobile": "?0",
		"sec-ch-ua-platform": "Windows",
		"sec-fetch-dest": "document",
		"sec-fetch-mode": "navigate",
		"sec-fetch-site": "none",
		"sec-fetch-user": "?1",
		"upgrade-insecure-requests": "1",
		"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
	}
};

let settingsPath = "";

exports.initSettings = function (userDataPath) {
	settingsPath = path.join(userDataPath, "settings.json");
	try {
		const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
		const cfg = exports.configure;
		if (typeof data.downloadParallel === "number") cfg.downloadParallel = data.downloadParallel;
		if (typeof data.lastFolder === "string") cfg.lastFolder = data.lastFolder;
		if (typeof data.defaultFormat === "string") cfg.defaultFormat = data.defaultFormat;
		if (typeof data.defaultAudioFormat === "string") cfg.defaultAudioFormat = data.defaultAudioFormat;
	} catch {}
};

exports.saveSettings = function () {
	if (!settingsPath) return;
	try {
		const cfg = exports.configure;
		const data = {
			downloadParallel: cfg.downloadParallel,
			lastFolder: cfg.lastFolder,
			defaultFormat: cfg.defaultFormat,
			defaultAudioFormat: cfg.defaultAudioFormat,
		};
		fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), "utf-8");
	} catch {}
};

exports.getSettings = function () {
	const cfg = exports.configure;
	return {
		downloadParallel: cfg.downloadParallel,
		lastFolder: cfg.lastFolder,
		defaultFormat: cfg.defaultFormat,
		defaultAudioFormat: cfg.defaultAudioFormat,
	};
};
