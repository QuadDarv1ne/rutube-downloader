const path = require("node:path");
const util = require("node:util");
const stream = require("node:stream");
const fs = require("node:fs");

const fetch = require("node-fetch");
const _colors = require("ansi-colors");
const splitFile = require("split-file");

const { configure } = require("./configure");
const { createDir, deleteFiles, deleteFile } = require("./fsUtils");
const { parallelFor } = require("./parallelFor");
const { getProgress } = require("./progress");
const { execFFmpeg } = require("./FFmpeg");
const { getExt } = require("./formats");

const streamPipeline = util.promisify(stream.pipeline);

const existsCount = list =>
	list.reduce((sum, item) => (item ? sum + 1 : sum), 0);

const joinNames = list => ({ filename: list.join(", ") });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function downloadSegment(segmentUrl, segmentFilePath, options) {
	try {
		let rs = await fetch(segmentUrl, options);
		if (rs.ok) {
			await streamPipeline(
				rs.body,
				fs.createWriteStream(segmentFilePath)
			);
			return null;
		} else {
			return new Error(`Ошибка загрузки: ${rs.status} ${rs.statusText}`);
		}
	} catch (e) {
		return e;
	}
}

exports.downloadFile = async function (cfg, segments, options) {
	await createDir(cfg.video);
	await deleteFiles(/^segment-.*\.\w+$/, cfg.video);

	process.title = "DOWNLOAD: " + cfg.title;
	
	console.log("\u00A0");
	console.log(
		"DOWNLOAD:".padStart(configure.padText, " "),
		_colors.yellowBright(cfg.title), "\n"
	);

	const progress = getProgress();
	const arrFiles = [];
	const activeSegmentsNums = new Set();
	let progressStopped = false;

	progress.start(segments.length, 0, { filename: " " });

	await parallelFor(
		cfg.parallelNum,
		segments,
		async (segmentUrl, segmentIndex) => {
			if (cfg.signal && cfg.signal.aborted) {
				throw new Error("Загрузка отменена");
			}
			const ext = path.extname(segmentUrl.split("?")[0]);
			const segmentFileName =
				"segment-" + `${segmentIndex + 1}`.padStart(10, "0") + ext;
			const segmentFilePath = path.join(cfg.video, segmentFileName);

			activeSegmentsNums.add(segmentIndex + 1);
			if (!progressStopped) {
				progress.update(
					existsCount(arrFiles),
					joinNames([...activeSegmentsNums].sort((a, b) => a - b))
				);
			}
			if (typeof cfg.onProgress === "function") {
				cfg.onProgress({ stage: "segments", current: existsCount(arrFiles), total: segments.length });
			}

			const error = await downloadSegment(
				segmentUrl,
				segmentFilePath,
				options
			);
			if (error) {
				progressStopped = true;
				progress.stop();
				throw error;
			}

			arrFiles[segmentIndex] = segmentFilePath;
			activeSegmentsNums.delete(segmentIndex + 1);

			if (!progressStopped) {
				progress.update(
					existsCount(arrFiles),
					joinNames([...activeSegmentsNums].sort((a, b) => a - b))
				);
			}
			if (typeof cfg.onProgress === "function") {
				cfg.onProgress({ stage: "segments", current: existsCount(arrFiles), total: segments.length });
			}
			await delay(50);
		}
	);

	progress.update(existsCount(arrFiles), { filename: " " });
	await delay(1000);
	progress.stop();

	if (typeof cfg.onProgress === "function") cfg.onProgress({ stage: "merge" });

	const saveTitle = cfg.title;
	const ext = path.extname(segments[0].split("?")[0]);
	const filesToMerge = arrFiles.filter(Boolean);
	console.log("\u00A0");
	console.log(_colors.yellowBright("VIDEO PROCESSING"));
	console.log(
		"\n",
		"COMBINING FILES:",
		_colors.yellowBright(`${filesToMerge.length}`),
		"FILES INTO A",
		_colors.yellowBright(`${saveTitle}${ext}`)
	);
	console.log(
		"PLEASE WAIT...".padStart(configure.padText, " "),
		"\n"
	);
	await splitFile.mergeFiles(
		filesToMerge,
		path.join(cfg.video, `${saveTitle}${ext}`)
	);
	console.log(
		"DELETE FILES:".padStart(configure.padText, " "),
		_colors.yellowBright(`${filesToMerge.length}`),
		"\n"
	);
	await deleteFiles(/^segment-.*\.\w+$/, cfg.video);

	const outExt = getExt(cfg.format || "mp4");
	const videoFileName = `${saveTitle}.${outExt}`;
	const videoFilePath = path.join(cfg.video, videoFileName);
	await deleteFile(videoFilePath);
	if (typeof cfg.onProgress === "function") cfg.onProgress({ stage: "convert" });
	console.log(
		"CONVERTING:".padStart(configure.padText, " "),
		_colors.yellowBright(`${saveTitle}${ext}`)
	);
	console.log(
		"TO:".padStart(configure.padText, " "),
		_colors.yellowBright(videoFileName)
	);
	console.log("PLEASE WAIT...".padStart(configure.padText, " "));
	console.log("\u00A0");
	const segmentsVideoFilePath = path.join(cfg.video, `${saveTitle}${ext}`);
	const ffmpegOpts = {};
	if (outExt === "mp4" || outExt === "mov") {
		ffmpegOpts.bsf = "aac_adtstoasc";
	}
	try {
		await execFFmpeg(segmentsVideoFilePath, videoFilePath, ffmpegOpts);
		await deleteFile(segmentsVideoFilePath);
	} catch (e) {
		console.log(_colors.redBright("FFmpeg ошибка: " + e.message));
		if (typeof cfg.onProgress === "function") {
			cfg.onProgress({ stage: "error", message: "FFmpeg: " + e.message });
		}
	}
	await delay(500);
	console.log(_colors.yellowBright("DONE!"));
	console.log("".padEnd(configure.padLine, "_"));
	return videoFileName;
};
