const { execFile, execFileSync } = require("node:child_process");
const path = require("node:path");
const { t } = require("./i18n");

let ffmpegPath;
let hideBannerSupported;
const FFMPEG_TIMEOUT = 600000; // 10 minutes default timeout

function findFFmpeg() {
	if (ffmpegPath) return ffmpegPath;
	// Always prefer bundled ffmpeg first
	const bundledPath = path.join(__dirname, "..", "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
	try {
		execFileSync(bundledPath, ["-version"], { stdio: "ignore", timeout: 5000 });
		ffmpegPath = bundledPath;
		return ffmpegPath;
	} catch {
		// Fall back to system ffmpeg
		try {
			execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
			ffmpegPath = "ffmpeg";
		} catch {
			ffmpegPath = bundledPath;
		}
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
	args.push("-max_muxing_queue_size", "4096");
	args.push("-movflags", "+faststart");

	args.push(output);
	if (isHideBannerSupported()) args.unshift("-hide_banner");

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error(t("ffmpeg.error.launch") + "ffmpeg process timed out after " + FFMPEG_TIMEOUT / 1000 + "s"));
		}, FFMPEG_TIMEOUT);

		const child = execFile(ffmpeg, args);
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
