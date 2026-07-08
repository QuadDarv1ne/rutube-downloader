const { execFile, execFileSync } = require("node:child_process");
const path = require("node:path");

let ffmpegPath;
let hideBannerSupported;

function findFFmpeg() {
	if (ffmpegPath) return ffmpegPath;
	try {
		execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
		ffmpegPath = "ffmpeg";
	} catch {
		ffmpegPath = path.join(__dirname, "..", "bin", "ffmpeg");
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

	return new Promise((resolve, reject) => {
		const child = execFile(ffmpeg, args);
		let stderr = "";
		child.stderr.on("data", chunk => { stderr += chunk; });
		child.on("error", err => {
			reject(new Error("ffmpeg не удалось запустить: " + err.message));
		});
		child.on("exit", code => {
			if (code) reject(new Error("ffmpeg error (code " + code + "): " + stderr.trim()));
			else resolve(true);
		});
	});
};

exports.getFFmpegPath = getFFmpegPath;
exports.isHideBannerSupported = isHideBannerSupported;
