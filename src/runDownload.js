const path = require("node:path");
const { configure } = require("./configure");
const { selectVideoProvider } = require("./videoProviders");

/**
 * Запуск загрузки без интерактивного диалога (для UI).
 * Использует существующие провайдеры и loadVideo с manualVideoQuality: false.
 */
async function runDownload(url, outputDir, options = {}) {
	const provider = selectVideoProvider(url);
	if (!provider.mayUse(url)) {
		throw new Error("Не найден загрузчик для: " + url);
	}
	const cfg = {
		root: outputDir,
		video: outputDir,
		title: undefined,
		parallelNum: 5,
		url,
		manualVideoQuality: false,
		quality: options.quality,
		format: options.format || "mp4",
		onProgress: options.onProgress,
		signal: options.signal,
	};
	const [name] = await provider.loadVideo(cfg);
	// После loadVideo провайдер мог изменить cfg.video (например, на outputDir/title)
	const videoDir = cfg.video;
	return path.join(videoDir, name);
}

module.exports = { runDownload };
