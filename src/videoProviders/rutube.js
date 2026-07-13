const path = require("node:path");
const { getManifest } = require("../m3u8Utils");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile } = require("../downloadFile");
const { sanitizeTitle } = require("./titleUtils");
const { fetchWithTimeout } = require("./fetchTimeout");

const regex_rutube = /^https?:\/\/rutube\.ru\/video\/(private\/)?(\w+)/;
// https://rutube.ru/video/private/3a16563c8168f75359cd099f76ff548e/?p=jXdLqNoqk4MzoCLAGH3-sw
module.exports = {
	mayUse: url => regex_rutube.test(url),

	loadVideo: async cfg => {
		const m = regex_rutube.exec(cfg.url);
		if (!m) {
			throw new Error(`Не удалось распознать URL: ${cfg.url}`);
		}
		const urlParse = new URL(cfg.url);
		const p = urlParse.search ? "&" + urlParse.search.slice(1) : "";
		const resp = await fetchWithTimeout(
			`https://rutube.ru/api/play/options/${m[2]}/?no_404=true&referer=https%3A%2F%2Frutube.ru${p}`,
			{},
			30000
		);
		/**
		 * Если неверный статус
		 */
		if (!resp.ok) {
			throw new Error(
				`Не удалось загрузить информацию о видео: ${cfg.url}\r\n\r\n${resp.status} ${resp.statusText}`
			);
		}

		const json = await resp.json();

		/**
		 * Если получили ошибку о видео
		 */
		if (
			typeof json.detail === "object" ||
			typeof json.detail === "string"
		) {
			const detailMsg =
				typeof json.detail === "string"
					? json.detail
					: json.detail?.languages?.[0]?.title ??
					  "неизвестная ошибка";
			throw new Error(
				`Не удалось загрузить информацию о видео: ${cfg.url}\r\n\r\n${detailMsg}`
			);
		}

		cfg.title = sanitizeTitle(cfg.title, json.title);
		const m3u8Url = json.video_balancer?.m3u8;
		if (!m3u8Url) {
			throw new Error(`video_balancer.m3u8 не найден: ${cfg.url}`);
		}
		const videoInfo = await getManifest(
			m3u8Url,
			"Не удалось получить видео:"
		);

		const playlists = videoInfo["playlists"];
		if (!playlists || !playlists.length) {
			throw new Error("Не удалось получить список качеств видео: " + cfg.url);
		}
		const [m3u8, quality] = await selectVideoQuality(cfg, playlists);

		// Получаем ссылку для составления будущих ссылок на сегмент
		const myURL = new URL(m3u8);
		const pathname = myURL.pathname.split("/");
		pathname.pop();
		const urlPrefix =
			myURL.protocol + "//" + myURL.host + "/" + pathname.join("/") + "/";

		// Получаем плейлист с сегментами
		const segmentsInfo = await getManifest(
			m3u8,
			"Не удалось получить сегменты:"
		);
		if (!segmentsInfo.segments || !segmentsInfo.segments.length) {
			throw new Error("Не удалось получить список сегментов видео: " + cfg.url);
		}
		const segmentsUrls = segmentsInfo.segments.map(
			segment => urlPrefix + segment["uri"]
		);
		cfg.video = path.join(cfg.video, cfg.title);
		const name = await downloadFile(cfg, segmentsUrls);
		return [name, quality];
	},
};
