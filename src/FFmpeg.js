const { execFile, execFileSync, spawn } = require("node:child_process");
const path = require("node:path");
const { t } = require("./i18n");

let ffmpegPath;
let hideBannerSupported;
const FFMPEG_TIMEOUT = 600000; // 10 minutes default timeout

function findFFmpeg() {
	if (ffmpegPath) return ffmpegPath;
	try {
		execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
		ffmpegPath = "ffmpeg";
	} catch {
		ffmpegPath = path.join(__dirname, "..", "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
	}
	return ffmpegPath;
}

function probeHideBanner(p) {
	try {
		execFileSync(p, ["-hide_banner", "-version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function getFFmpegPath() {
	if (!ffmpegPath) findFFmpeg();
	return ffmpegPath;
}

function isHideBannerSupported() {
	if (hideBannerSupported === undefined) {
		hideBannerSupported = probeHideBanner(getFFmpegPath());
	}
	return hideBannerSupported;
}

exports.execFFmpeg = async (input, output, options = {}) => {
	const ffmpeg = getFFmpegPath();
	const args = ["-y", "-i", input, "-vcodec", "copy", "-acodec", "copy"];

	if (options.bsf) args.push("-bsf:a", options.bsf);
	if (options.outputFormat) args.push("-f", options.outputFormat);

	args.push(output);
	if (isHideBannerSupported()) args.unshift("-hide_banner");

	const spawnOpts = {
		shell: process.platform === "win32",
		timeout: FFMPEG_TIMEOUT,
	};

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(t("ffmpeg.error.launch") + "ffmpeg process timed out after " + FFMPEG_TIMEOUT / 1000 + "s"));
		}, FFMPEG_TIMEOUT);

		const child = spawn(ffmpeg, args, spawnOpts);
		let stderr = "";

		child.stderr.on("data", chunk => { stderr += chunk; });
		child.on("error", err => {
			clearTimeout(timer);
			reject(new Error(t("ffmpeg.error.launch") + err.message));
		});
		child.on("exit", code => {
			clearTimeout(timer);
			if (code) reject(new Error("ffmpeg error (code " + code + "): " + stderr.trim()));
			else resolve(true);
		});
	});
};

exports.getFFmpegPath = getFFmpegPath;
exports.isHideBannerSupported = isHideBannerSupported;
