const fetch = require("node-fetch");
const path = require("node:path");
const { getManifest } = require("../m3u8Utils");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile } = require("../downloadFile");
const { sanitizeTitle } = require("./titleUtils");
const { fetchWithTimeout } = require("./fetchTimeout");

const regex_ok = /^https:\/\/ok.ru\/(?:video|videoembed)\/(\d+)/;

module.exports = {
	mayUse: url => regex_ok.test(url),

	loadVideo: async cfg => {
		const regex = /<div\s+data-module="OKVideo".+data-options="(.+)"\s+data-player-container-id=/;

		const m = regex_ok.exec(cfg.url);
		if (!m) {
			throw new Error(`Не удалось распознать URL: ${cfg.url}`);
		}
		const resp = await fetchWithTimeout(
			`https://ok.ru/videoembed/${m[1]}`,
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
		let text = await resp.textConverted();

		const _m = regex.exec(text);
		if (!_m) {
			throw new Error(
				`Не удалось загрузить информацию о видео: ${cfg.url}\r\n\r\n${resp.status} ${resp.statusText}`
			);
		}
		const json = JSON.parse(_m[1].replace(/&quot;/g, '"'));
		if (!json?.flashvars?.metadata) {
			throw new Error(`Не удалось извлечь данные о видео: ${cfg.url}`);
		}
		const metadata = JSON.parse(json.flashvars.metadata);
		const url = metadata.hlsManifestUrl;
		if (!url) {
			throw new Error(`HLS ссылка не найдена: ${cfg.url}`);
		}

		const hlsUrl = new URL(url);

		cfg.title = sanitizeTitle(cfg.title, metadata.movie.title);
		const videoInfo = await getManifest(
			url,
			"Не удалось получить видео:"
		);

		process.title = "DOWNLOAD: " + cfg.title;

		const [m3u8, quality] = await selectVideoQuality(
			cfg,
			videoInfo["playlists"]
		);
		const urlPrefix = hlsUrl.protocol + "//" + hlsUrl.host;
		const segmentsUrl = urlPrefix + m3u8;
		// Получаем плейлист с сегментами
		const segmentsInfo = await getManifest(
			segmentsUrl,
			"Не удалось получить сегменты:"
		);
		const segmentsUrls = segmentsInfo.segments.map(
			segment => new URL(segment["uri"], segmentsUrl).href
		);
		cfg.video = path.join(cfg.video, cfg.title);
		const name = await downloadFile(cfg, segmentsUrls);
		return [name, quality];
	},
};
