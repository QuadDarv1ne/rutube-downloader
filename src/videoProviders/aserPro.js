const path = require("node:path");
const { downloadFile } = require("../downloadFile");
const { selectVideoQuality } = require("../dialogue");
const { getManifest } = require("../m3u8Utils");
const { sanitizeTitle } = require("./titleUtils");

const regexAserPro = /^https?:\/\/aser\.pro\/content\/.+?\/hls\/index.m3u8$/;

module.exports = {
	mayUse: url => regexAserPro.test(url),

	loadVideo: async function (cfg) {
		const videoInfo = await getManifest(
			cfg.url,
			"Не удалось получить видео:"
		);
		cfg.title = sanitizeTitle(cfg.title);
		const [playlist, quality] = await selectVideoQuality(
			cfg,
			videoInfo["playlists"]
		);

		const segmentsUrl = new URL(playlist, cfg.url).href;
		const segmentsInfo = await getManifest(
			segmentsUrl,
			"Не удалось получить сегменты:"
		);

		const segmentsUrls = segmentsInfo["segments"].map(segment =>
			(new URL(segment["uri"], segmentsUrl)).href
		);
		cfg.video = path.join(cfg.video, cfg.title);
		const name = await downloadFile(cfg, segmentsUrls);
		return [name, quality];
	},
};
