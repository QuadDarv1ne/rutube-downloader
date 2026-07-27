const path = require("node:path");
const { execFile } = require("node:child_process");
const { getExt, getAudioExt } = require("./formats");
const { getFFmpegPath, isHideBannerSupported } = require("./FFmpeg");
const { t } = require("./i18n");

const AUDIO_ARGS = {
	mp3: ["-vn", "-codec:a", "libmp3lame", "-q:a", "2"],
	wav: ["-vn", "-codec:a", "pcm_s16le"],
	flac: ["-vn", "-codec:a", "flac"],
};

exports.convertFile = function (src, destDir, format, onProgress, signal) {
	const ffmpeg = getFFmpegPath();
	const srcName = path.basename(src, path.extname(src));
	const outExt = getExt(format);
	const outName = `${srcName}.${outExt}`;
	const outPath = path.join(destDir, outName);

	if (signal && signal.aborted) {
		return Promise.reject(new Error(t("error.downloadCancelled")));
	}

	const args = ["-y", "-i", src, "-c", "copy", "-map_metadata", "0"];
	if (outExt === "mp4" || outExt === "mov") {
		args.push("-bsf:a", "aac_adtstoasc");
	}
	args.push(outPath);
	if (isHideBannerSupported()) args.unshift("-hide_banner");

	return new Promise((resolve, reject) => {
		if (onProgress)
			onProgress({
				stage: "convert",
				message: t("cli.converting") + " " + path.basename(src) + " \u2192 " + outName,
			});

		const child = execFile(ffmpeg, args);
		let stderr = "";
		let aborted = false;

		let abortHandler;
		if (signal) {
			abortHandler = () => {
				aborted = true;
				child.kill("SIGTERM");
			};
			signal.addEventListener("abort", abortHandler, { once: true });
		}

		const cleanup = () => {
			if (signal && abortHandler) {
				signal.removeEventListener("abort", abortHandler);
			}
		};

		child.stderr.on("data", chunk => {
			stderr += chunk;
		});
		child.on("error", err => {
			cleanup();
			if (aborted) return reject(new Error(t("error.downloadCancelled")));
			reject(new Error(t("ffmpeg.error.launch") + err.message));
		});
		child.on("exit", code => {
			cleanup();
			if (aborted) return reject(new Error(t("error.downloadCancelled")));
			if (code)
				reject(
					new Error(
						"ffmpeg error (code " + code + "): " + stderr.trim()
					)
				);
			else resolve(outPath);
		});
	});
};

exports.extractAudio = function (src, destDir, format, onProgress, signal) {
	const ffmpeg = getFFmpegPath();
	const srcName = path.basename(src, path.extname(src));
	const outExt = getAudioExt(format);
	const outName = `${srcName}.${outExt}`;
	const outPath = path.join(destDir, outName);

	const audioArgs = AUDIO_ARGS[format];
	if (!audioArgs) {
		throw new Error(t("error.unsupportedAudioFormat") + format);
	}

	if (signal && signal.aborted) {
		return Promise.reject(new Error(t("error.downloadCancelled")));
	}

	const args = ["-y", "-i", src, ...audioArgs, outPath];
	if (isHideBannerSupported()) args.unshift("-hide_banner");

	return new Promise((resolve, reject) => {
		if (onProgress)
			onProgress({
				stage: "convert",
				message: t("cli.extractingAudio") + path.basename(src) + " \u2192 " + outName,
			});

		const child = execFile(ffmpeg, args);
		let stderr = "";
		let aborted = false;

		let abortHandler;
		if (signal) {
			abortHandler = () => {
				aborted = true;
				child.kill("SIGTERM");
			};
			signal.addEventListener("abort", abortHandler, { once: true });
		}

		const cleanup = () => {
			if (signal && abortHandler) {
				signal.removeEventListener("abort", abortHandler);
			}
		};

		child.stderr.on("data", chunk => {
			stderr += chunk;
		});
		child.on("error", err => {
			cleanup();
			if (aborted) return reject(new Error(t("error.downloadCancelled")));
			reject(new Error(t("ffmpeg.error.launch") + err.message));
		});
		child.on("exit", code => {
			cleanup();
			if (aborted) return reject(new Error(t("error.downloadCancelled")));
			if (code)
				reject(
					new Error(
						"ffmpeg error (code " + code + "): " + stderr.trim()
					)
				);
			else resolve(outPath);
		});
	});
};
