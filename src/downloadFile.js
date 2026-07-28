const path = require("node:path");
const util = require("node:util");
const stream = require("node:stream");
const fs = require("node:fs");

const fetch = require("node-fetch");
const _colors = require("ansi-colors");

const { configure } = require("./configure");
const { createDir, deleteFiles, deleteFile } = require("./fsUtils");
const { parallelFor } = require("./parallelFor");
const { getProgress } = require("./progress");
const { execFFmpeg } = require("./FFmpeg");
const { getExt } = require("./formats");
const { t } = require("./i18n");

const streamPipeline = util.promisify(stream.pipeline);

const existsCount = list =>
	list.reduce((sum, item) => (item ? sum + 1 : sum), 0);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
exports.delay = delay;

const MAX_SEGMENT_RETRIES = configure.segmentRetries || 5;
const SEGMENT_TIMEOUT = configure.segmentTimeout || 120000;

exports.mergeAndConvert = async function (cfg, segmentFiles, title) {
	const saveTitle = title || cfg.title;
	const ext = path.extname(segmentFiles[0].split("?")[0]) || ".ts";

	console.log("\u00A0");
	console.log(_colors.yellowBright(t("cli.videoProcessing")));
	console.log(
		"\n",
		t("cli.combining"),
		_colors.yellowBright(`${segmentFiles.length}`),
		t("cli.filesInto"),
		_colors.yellowBright(`${saveTitle}${ext}`)
	);
	console.log(t("cli.pleaseWait").padStart(configure.padText, " "), "\n");

	const outExt = getExt(cfg.format || "mp4");
	const videoFileName = `${saveTitle}.${outExt}`;
	const videoFilePath = path.join(cfg.video, videoFileName);
	await deleteFile(videoFilePath);
	if (typeof cfg.onProgress === "function")
		cfg.onProgress({ stage: "convert" });
	console.log(
		t("cli.converting").padStart(configure.padText, " "),
		_colors.yellowBright(`${saveTitle}${ext}`)
	);
	console.log(
		t("cli.to").padStart(configure.padText, " "),
		_colors.yellowBright(videoFileName)
	);
	console.log(t("cli.pleaseWait").padStart(configure.padText, " "));
	console.log("\u00A0");

	const fileListPath = path.join(cfg.video, "filelist.txt");
	const fileListContent = segmentFiles
		.map(f => "file '" + f.replace(/\\/g, "/").replace(/'/g, "'\\''") + "'")
		.join("\n");
	fs.writeFileSync(fileListPath, fileListContent, "utf8");

	const ffmpegOpts = { concat: true };
	if (outExt === "mp4" || outExt === "mov") {
		ffmpegOpts.bsf = "aac_adtstoasc";
	}
	try {
		await execFFmpeg(fileListPath, videoFilePath, ffmpegOpts);
	} catch (e) {
		console.log(_colors.redBright(t("ffmpeg.error.launch") + e.message));
		if (typeof cfg.onProgress === "function") {
			cfg.onProgress({
				stage: "error",
				message: t("ffmpeg.error.launch") + e.message,
			});
		}
		throw e;
	} finally {
		await deleteFile(fileListPath);
		await deleteFiles(/^segment-.*\.\w+$/, cfg.video);
	}
	return videoFileName;
};

async function downloadSegment(
	segmentUrl,
	segmentFilePath,
	options,
	segmentIndex,
	signal
) {
	if (signal?.aborted) throw new Error(t("error.downloadCancelled"));
	let lastError;
	for (let attempt = 1; attempt <= MAX_SEGMENT_RETRIES; attempt++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), SEGMENT_TIMEOUT);
		let onAbort;
		if (signal) {
			onAbort = () => controller.abort();
			signal.addEventListener("abort", onAbort);
		}
		try {
			if (signal?.aborted) throw new Error(t("error.downloadCancelled"));
			let rs = await fetch(segmentUrl, {
				...options,
				signal: controller.signal,
			});
			if (rs.ok) {
				await streamPipeline(
					rs.body,
					fs.createWriteStream(segmentFilePath)
				);
				const stat = fs.statSync(segmentFilePath);
				if (stat.size === 0) {
					lastError = new Error(
						`Empty segment file (attempt ${attempt})`
					);
					try {
						fs.unlinkSync(segmentFilePath);
					} catch {}
					if (attempt < MAX_SEGMENT_RETRIES) {
						await delay(2000 * attempt);
					}
					continue;
				}
				return null;
			} else {
				lastError = new Error(`HTTP ${rs.status} ${rs.statusText}`);
			}
		} catch (e) {
			lastError = e;
		} finally {
			clearTimeout(timer);
			if (signal && onAbort) {
				signal.removeEventListener("abort", onAbort);
			}
		}
		try {
			fs.unlinkSync(segmentFilePath);
		} catch {}
		if (attempt < MAX_SEGMENT_RETRIES) {
			await delay(2000 * attempt);
		}
	}
	return lastError;
}
exports.downloadSegment = downloadSegment;

exports.downloadFile = async function (cfg, segments, options) {
	await createDir(cfg.video);
	await deleteFiles(/^segment-.*\.\w+$/, cfg.video);
	let cleanupNeeded = true;

	process.title = t("cli.download") + " " + cfg.title;

	console.log("\u00A0");
	console.log(
		t("cli.download").padStart(configure.padText, " "),
		_colors.yellowBright(cfg.title),
		"\n"
	);

	const progress = getProgress();
	const arrFiles = [];
	const activeSegmentsNums = new Set();
	let progressStopped = false;
	let totalBytes = 0;

	progress.start(segments.length, 0, { filename: " ", totalBytes: 0 });

	const signal = cfg.signal;
	if (signal?.aborted) {
		cleanupNeeded = false;
		throw new Error(t("error.downloadCancelled"));
	}

	try {
		await parallelFor(
			cfg.parallelNum,
			segments,
			async (segmentUrl, segmentIndex) => {
				if (signal?.aborted)
					throw new Error(t("error.downloadCancelled"));
				const ext = path.extname(segmentUrl.split("?")[0]) || ".ts";
				const segmentFileName =
					"segment-" + `${segmentIndex + 1}`.padStart(10, "0") + ext;
				const segmentFilePath = path.join(cfg.video, segmentFileName);

				activeSegmentsNums.add(segmentIndex + 1);
				if (!progressStopped) {
					progress.update(existsCount(arrFiles), {
						filename:
							[...activeSegmentsNums]
								.sort((a, b) => a - b)
								.join(", ") || " ",
						totalBytes,
					});
				}
				if (typeof cfg.onProgress === "function") {
					cfg.onProgress({
						stage: "segments",
						current: existsCount(arrFiles),
						total: segments.length,
					});
				}
				const error = await downloadSegment(
					segmentUrl,
					segmentFilePath,
					options,
					segmentIndex + 1,
					signal
				);
				if (error) {
					progressStopped = true;
					progress.stop();
					const segErr = new Error(
						`${t("error.segmentFailed")} #${segmentIndex + 1}: ${
							error.message
						}`
					);
					console.log(_colors.redBright(segErr.message));
					throw segErr;
				}

				arrFiles[segmentIndex] = segmentFilePath;
				activeSegmentsNums.delete(segmentIndex + 1);

				try {
					totalBytes += fs.statSync(segmentFilePath).size;
				} catch {}
				if (!progressStopped) {
					progress.update(existsCount(arrFiles), {
						filename:
							[...activeSegmentsNums]
								.sort((a, b) => a - b)
								.join(", ") || " ",
						totalBytes,
					});
				}
				if (typeof cfg.onProgress === "function") {
					cfg.onProgress({
						stage: "segments",
						current: existsCount(arrFiles),
						total: segments.length,
					});
				}
			},
			signal
		);

		if (!progressStopped) {
			progress.update(existsCount(arrFiles), {
				filename: " ",
				totalBytes,
			});
			progress.stop();
		}

		if (typeof cfg.onProgress === "function")
			cfg.onProgress({ stage: "merge" });

		const saveTitle = cfg.title;
		const filesToMerge = arrFiles.filter(Boolean);
		const videoFileName = await exports.mergeAndConvert(
			cfg,
			filesToMerge,
			saveTitle
		);
		await delay(500);
		cleanupNeeded = false;
		console.log(_colors.yellowBright(t("cli.done")));
		console.log("".padEnd(configure.padLine, "_"));
		return videoFileName;
	} catch (e) {
		if (cleanupNeeded) {
			deleteFiles(/^segment-.*\.\w+$/, cfg.video).catch(() => {});
		}
		if (!progressStopped) {
			progress.stop();
		}
		throw e;
	}
};
