const path = require("node:path");
const emojiStrip = require('emoji-strip');
const sanitize = require("sanitize-filename");
const { downloadFile } = require("../downloadFile");
const { selectVideoQuality } = require("../dialogue");
const { uuid9 } = require("../uid");
const { getManifest } = require("../m3u8Utils");

const regexAserPro = /^https?:\/\/aser\.pro\/content\/.+?\/hls\/index.m3u8$/;

module.exports = {
	mayUse: url => regexAserPro.test(url),

	loadVideo: async function (cfg) {
		const videoInfo = await getManifest(cfg.url, "get video info:");
		cfg.title = sanitize(emojiStrip(cfg.title ?? uuid9())).replace(/\s+/g, " ");
		const [playlist, quality] = await selectVideoQuality(
			cfg,
			videoInfo["playlists"]
		);

		const segmentsUrl = new URL(playlist, cfg.url).href;
		const segmentsInfo = await getManifest(
			segmentsUrl,
			"get segments info:"
		);

		const segmentsUrls = segmentsInfo["segments"].map(segment =>
			(new URL(segment["uri"], segmentsUrl)).href
		);

		const name = await downloadFile(cfg, segmentsUrls);
		return [name, quality];
	},
};
