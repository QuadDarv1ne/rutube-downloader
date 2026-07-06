const fetch = require("node-fetch");
const path = require("node:path");
const { getManifest } = require("../m3u8Utils");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile } = require("../downloadFile");
const { sanitizeTitle } = require("./titleUtils");

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
		const p = urlParse.query ? "&" + urlParse.query : "";
		const resp = await fetch(
			`https://rutube.ru/api/play/options/${m[2]}/?no_404=true&referer=https%3A%2F%2Frutube.ru${p}`
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
		if(typeof json.detail === 'object'){
			const detailMsg = json.detail?.languages?.[0]?.title ?? "неизвестная ошибка";
			throw new Error(
				`Не удалось загрузить информацию о видео: ${cfg.url}\r\n\r\n${detailMsg}`
			);
		}

		cfg.title = sanitizeTitle(cfg.title, json.title);
		const videoInfo = await getManifest(
			json["video_balancer"]["m3u8"],
			"Не удалось получить видео:"
		);

		const [m3u8, quality] = await selectVideoQuality(
			cfg,
			videoInfo["playlists"]
		);

		// Получаем ссылку для составления будущих ссылок на сегмент
		const myURL = new URL(m3u8);
		const pathname = myURL.pathname.split("/");
		pathname.pop();
		const urlPrefix = myURL.protocol + "//" + myURL.host + "/" + pathname.join("/") + "/";

		// Получаем плейлист с сегментами
		const segmentsInfo = await getManifest(
			m3u8,
			"Не удалось получить сегменты:"
		);
		const segmentsUrls = segmentsInfo.segments.map(
			segment => urlPrefix + segment["uri"]
		);
		cfg.video = path.join(cfg.video, cfg.title);
		const name = await downloadFile(cfg, segmentsUrls);
		return [name, quality];
	},
};
