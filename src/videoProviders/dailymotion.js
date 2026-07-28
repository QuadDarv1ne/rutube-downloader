const path = require("node:path");
const { getManifest } = require("../m3u8Utils");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile } = require("../downloadFile");
const { sanitizeTitle } = require("./titleUtils");
const { t } = require("../i18n");

const regex_dailymotion = /^https?:\/\/(?:www\.)?dailymotion\.com\/video\/(\w+)/;

module.exports = {
	mayUse: url => regex_dailymotion.test(url),

	loadVideo: async cfg => {
		const m = regex_dailymotion.exec(cfg.url);
		if (!m) {
			throw new Error(t("error.cannotParseUrl") + cfg.url);
		}

		const videoId = m[1];
		// Dailymotion API endpoint for video info
		const apiUrl = `https://dailymotion.com/player/video/${videoId}`;

		const resp = await require("./fetchTimeout").fetchWithTimeout(
			apiUrl,
			{
				headers: {
					"Accept": "application/json",
					"Referer": "https://www.dailymotion.com/",
				},
			},
			30000
		);

		if (!resp.ok) {
			throw new Error(
				t("error.cannotLoadVideoInfo") + cfg.url + "\r\n\r\n" + resp.status + " " + resp.statusText
			);
		}

		const json = await resp.json();

		if (!json?.qualities?.hls) {
			throw new Error(t("error.cannotGetVideo") + cfg.url);
		}

		cfg.title = sanitizeTitle(cfg.title, json.title);

		// Find the best HLS manifest URL
		const qualities = json.qualities.hls;
		if (!qualities || !Array.isArray(qualities)) {
			throw new Error(t("error.cannotGetVideoQualities") + cfg.url);
		}

		// Get the highest quality manifest
		let bestManifestUrl = null;
		for (const quality of qualities) {
			if (quality.url) {
				bestManifestUrl = quality.url;
			}
		}

		if (!bestManifestUrl) {
			throw new Error(t("error.cannotGetVideo") + cfg.url);
		}

		const videoInfo = await getManifest(bestManifestUrl, t("error.cannotGetVideo"));
		const playlists = videoInfo["playlists"];

		if (!playlists || !playlists.length) {
			throw new Error(t("error.cannotGetVideoQualities") + cfg.url);
		}

		const [m3u8, quality] = await selectVideoQuality(cfg, playlists);

		const myURL = new URL(m3u8);
		const pathname = myURL.pathname.split("/");
		pathname.pop();
		const urlPrefix = myURL.protocol + "//" + myURL.host + "/" + pathname.join("/") + "/";

		const segmentsInfo = await getManifest(m3u8, t("error.cannotGetSegments"));
		if (!segmentsInfo.segments || !segmentsInfo.segments.length) {
			throw new Error(t("error.cannotGetSegmentList") + cfg.url);
		}

		const segmentsUrls = segmentsInfo.segments.map(
			segment => new URL(segment["uri"], urlPrefix).href
		);

		cfg.video = path.join(cfg.video, cfg.title);
		const options = {
			headers: {
				Referer: "https://www.dailymotion.com/",
				Origin: "https://www.dailymotion.com",
			},
		};

		const name = await downloadFile(cfg, segmentsUrls, options);
		return [name, quality];
	},
};
