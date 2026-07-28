const path = require("node:path");
const { getManifest } = require("../m3u8Utils");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile } = require("../downloadFile");
const { sanitizeTitle } = require("./titleUtils");
const { fetchWithTimeout } = require("./fetchTimeout");
const { t } = require("../i18n");

const regex_dailymotion = /^https?:\/\/(?:www\.)?dailymotion\.com\/video\/(\w+)/;

/**
 * Извлекает ID видео из URL Dailymotion (включая короткие ссылки dm.tv)
 */
function extractVideoId(url) {
	try {
		const u = new URL(url);
		// dailymotion.com/video/k0abc123 или dailymotion.com/embed/video/k0abc123
		const parts = u.pathname.split("/");
		for (let i = 0; i < parts.length; i++) {
			if (parts[i] === "video" && i + 1 < parts.length) {
				return parts[i + 1];
			}
			if (parts[i] === "embed" && i + 2 < parts.length && parts[i + 1] === "video") {
				return parts[i + 2];
			}
		}
		// Короткие ссылки dm.tv/xxxxx
		if (u.hostname === "dm.tv") {
			return u.pathname.slice(1);
		}
	} catch {}
	return null;
}

module.exports = {
	mayUse: url => regex_dailymotion.test(url),

	loadVideo: async cfg => {
		const videoId = extractVideoId(cfg.url);
		if (!videoId) {
			throw new Error(t("error.cannotParseUrl") + cfg.url);
		}

		// Dailymotion embed API
		const apiUrl = `https://dailymotion.com/player/v2/video/${videoId}`;

		const resp = await fetchWithTimeout(
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

		if (!json?.qualities || !json.qualities.hls) {
			throw new Error(t("error.cannotGetVideo") + cfg.url);
		}

		cfg.title = sanitizeTitle(cfg.title, json.title);

		const qualities = json.qualities.hls;
		if (!qualities || !Array.isArray(qualities)) {
			throw new Error(t("error.cannotGetVideoQualities") + cfg.url);
		}

		// Find the highest quality manifest URL
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
