const path = require("node:path");
const { execFile } = require("node:child_process");
const { getExt } = require("./formats");
const { getFFmpegPath, isHideBannerSupported } = require("./FFmpeg");

exports.convertFile = function (src, destDir, format, onProgress) {
	const ffmpeg = getFFmpegPath();
	const srcName = path.basename(src, path.extname(src));
	const outExt = getExt(format);
	const outName = `${srcName}.${outExt}`;
	const outPath = path.join(destDir, outName);

	const args = ["-y", "-i", src, "-c", "copy", "-map_metadata", "0"];
	if (outExt === "mp4" || outExt === "mov") {
		args.push("-bsf:a", "aac_adtstoasc");
	}
	args.push(outPath);
	if (isHideBannerSupported()) args.unshift("-hide_banner");

	return new Promise((resolve, reject) => {
		if (onProgress) onProgress({ stage: "convert", message: `Конвертация: ${path.basename(src)} → ${outName}` });

		const child = execFile(ffmpeg, args);
		let stderr = "";
		child.stderr.on("data", chunk => { stderr += chunk; });
		child.on("error", err => {
			reject(new Error("ffmpeg не удалось запустить: " + err.message));
		});
		child.on("exit", code => {
			if (code) reject(new Error("ffmpeg error (code " + code + "): " + stderr.trim()));
			else resolve(outPath);
		});
	});
};
