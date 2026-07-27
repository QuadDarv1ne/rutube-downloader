const path = require("node:path");
const { downloadFile } = require("../downloadFile");
const { selectVideoQuality } = require("../dialogue");
const { getManifest } = require("../m3u8Utils");
const { sanitizeTitle } = require("./titleUtils");
const { t } = require("../i18n");

const regexAserPro = /^https?:\/\/(?:www\.)?aser\.pro\/content\/.+?\/hls\/index\.m3u8/;

module.exports = {
	mayUse: url => regexAserPro.test(url),

	loadVideo: async function (cfg) {
		const videoInfo = await getManifest(
			cfg.url,
			t("error.cannotGetVideo")
		);
		cfg.title = sanitizeTitle(cfg.title);
		const playlists = videoInfo["playlists"];
		if (!playlists || !playlists.length) {
			throw new Error(t("error.cannotGetVideoQualities") + cfg.url);
		}
		const [playlist, quality] = await selectVideoQuality(cfg, playlists);

		const segmentsUrl = new URL(playlist, cfg.url).href;
		const segmentsInfo = await getManifest(
			segmentsUrl,
			t("error.cannotGetSegments")
		);

		if (!segmentsInfo.segments || !segmentsInfo.segments.length) {
			throw new Error(t("error.cannotGetSegmentList") + cfg.url);
		}
		const segmentsUrls = segmentsInfo.segments.map(segment =>
			new URL(segment["uri"], segmentsUrl).href
		);
		cfg.video = path.join(cfg.video, cfg.title);
		const options = {
			headers: {
				Referer: "https://aser.pro/",
				Origin: "https://aser.pro",
			},
		};
		const name = await downloadFile(cfg, segmentsUrls, options);
		return [name, quality];
	},
};
