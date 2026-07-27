const path = require("node:path");
const { getManifest } = require("../m3u8Utils");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile } = require("../downloadFile");
const { sanitizeTitle } = require("./titleUtils");
const { fetchWithTimeout } = require("./fetchTimeout");
const { configure } = require("../configure");
const { t } = require("../i18n");

const regex_rutube = /^https?:\/\/(?:www\.)?rutube\.(?:ru|com)\/video\/(private\/)?(\w+)/;
// https://rutube.ru/video/private/3a16563c8168f75359cd099f76ff548e/?p=jXdLqNoqk4MzoCLAGH3-sw
const browserHeaders = configure.browserHeaders;

module.exports = {
	mayUse: url => regex_rutube.test(url),

	loadVideo: async cfg => {
		const m = regex_rutube.exec(cfg.url);
		if (!m) {
			throw new Error(t("error.cannotParseUrl") + cfg.url);
		}
		const urlParse = new URL(cfg.url);
		const p = urlParse.search ? "&" + urlParse.search.slice(1) : "";
		const resp = await fetchWithTimeout(
			`https://rutube.ru/api/play/options/${m[2]}/?no_404=true&referer=https%3A%2F%2Frutube.ru${p}`,
			{ headers: browserHeaders },
			30000
		);
		if (!resp.ok) {
			throw new Error(
				t("error.cannotLoadVideoInfo") + cfg.url + "\r\n\r\n" + resp.status + " " + resp.statusText
			);
		}

		const json = await resp.json();

		if (
			typeof json.detail === "object" ||
			typeof json.detail === "string"
		) {
			const detailMsg =
				typeof json.detail === "string"
					? json.detail
					: json.detail?.languages?.[0]?.title ??
					  t("error.unknownError");
			throw new Error(
				t("error.cannotLoadVideoInfo") + cfg.url + "\r\n\r\n" + detailMsg
			);
		}

		cfg.title = sanitizeTitle(cfg.title, json.title);
		const m3u8Url = json.video_balancer?.m3u8;
		if (!m3u8Url) {
			throw new Error(t("error.videoBalancerNotFound") + cfg.url);
		}
		const videoInfo = await getManifest(
			m3u8Url,
			t("error.cannotGetVideo")
		);

		const playlists = videoInfo["playlists"];
		if (!playlists || !playlists.length) {
			throw new Error(t("error.cannotGetVideoQualities") + cfg.url);
		}
		const [m3u8, quality] = await selectVideoQuality(cfg, playlists);

		const myURL = new URL(m3u8);
		const pathname = myURL.pathname.split("/");
		pathname.pop();
		const urlPrefix =
			myURL.protocol + "//" + myURL.host + "/" + pathname.join("/") + "/";

		const segmentsInfo = await getManifest(
			m3u8,
			t("error.cannotGetSegments")
		);
		if (!segmentsInfo.segments || !segmentsInfo.segments.length) {
			throw new Error(t("error.cannotGetSegmentList") + cfg.url);
		}
		const segmentsUrls = segmentsInfo.segments.map(
			segment => new URL(segment["uri"], urlPrefix).href
		);
		cfg.video = path.join(cfg.video, cfg.title);
		const options = {
			headers: {
				Referer: "https://rutube.ru/",
				Origin: "https://rutube.ru",
			},
		};
		const name = await downloadFile(cfg, segmentsUrls, options);
		return [name, quality];
	},
};
