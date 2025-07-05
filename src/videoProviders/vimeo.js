const fetch = require("node-fetch");
const path = require("node:path");
const { selectVideoQuality } = require("../dialogue");
const URL = require("node:url");
const _colors = require("ansi-colors");
const { extension } = require('mime-types');
const emojiStrip = require('emoji-strip');
const sanitize = require("sanitize-filename");
const { Downloader } = require("nodejs-file-downloader");
const { uuid9 } = require("../uid");
const { vimeoPlaylist } = require("../vimeoPlaylist");
const { createDir, deleteFiles, deleteFile } = require("../fsUtils");
const { getProgress } = require("../progress");

const regexp_vimeo = /^https?:\/\/(?:player.|www.)?(?:vimeo\.com|)\/(?:video\/)?([A-Za-z0-9._%-]*)(?:\&\S+)?/;

module.exports = {
	mayUse: url => regexp_vimeo.test(url),

	loadVideo: async cfg => {
		const m = regexp_vimeo.exec(cfg.url);

		let resp = await fetch(
			`https://player.vimeo.com/video/${m[1]}`
		);
		/**
		 * Если неверный статус
		 */
		if (!resp.ok) {
			throw new Error(
				`Не удалось загрузить информацию о видео: ${cfg.url}\r\n\r\n${resp.status} ${resp.statusText}`
			);
		}

		const regex = /<script>window\.playerConfig = ({.+})<\/script>/gm;
		let text = await resp.text();
		let playerConfig = regex.exec(text);

		if(!playerConfig) {
			throw new Error(
				`Не удалось загрузить информацию о видео: ${cfg.url}\r\n\r\n${resp.status} ${resp.statusText}`
			);
		}

		playerConfig = JSON.parse(playerConfig[1]);
		cfg.title = sanitize(emojiStrip(cfg.title ?? (playerConfig.video.title ?? uuid9()))).replace(/\s+/g, " ");
		cfg.video = path.join(cfg.video, cfg.title);
		resp = await fetch(
			playerConfig.request.config_refresh_url
		);

		if (!resp.ok) {
			throw new Error(
				`Не удалось загрузить информацию о видео: ${cfg.url}\r\n\r\n${resp.status} ${resp.statusText}`
			);
		}

		let json = await resp.json();
		/**
		 * Приведём к стандартному плейлисту
		 */
		let playlist;
		if (json.files.progressive) {
			playlist = vimeoPlaylist(json.files.progressive);
		}else{
			if(json.files.hls){
				/**
				 * В данном направлении ts
				 */
				//
			}
			throw new Error(
				`Не удалось загрузить информацию о видео: ${cfg.url}\r\n\r\n${resp.status} ${resp.statusText}`
			);
		}

		const [url, quality, ext] = await selectVideoQuality(
			cfg,
			playlist
		);
		/**
		 * Start
		 * 
		 * Пока не имеет смысла выносить в модуль
		 */
		await createDir(cfg.video);

		console.log("\u00A0");
		console.log(
			"DOWNLOAD:".padStart(16, " "),
			_colors.yellowBright(cfg.title), "\n"
		);

		const progress = getProgress();

		const fileName = `${cfg.title}.${extension(ext)}`;
		let total = 0;
		const downloader = new Downloader({
			url: url,
			directory: cfg.video,
			fileName: fileName,
			cloneFiles: false,
			onResponse: function(response) {
				total = response.headers["content-length"];
				progress.start(total, 0, {provider: 'vimeo'});
			},
			onProgress: function (percentage, chunk, remainingSize) {
				progress.update(total - remainingSize);
			}
		});

		try {
			await downloader.download();
		} catch (error) {
			console.log(error);
		} finally {
			progress.stop();
		}

		console.log("\u00A0");
		console.log(
			"SAVE:".padStart(16, " "),
			_colors.yellowBright(fileName)
		);

		console.log("\u00A0");
		console.log(_colors.yellowBright("DONE!"));
		console.log("_".padEnd(20, "_"));
		/**
		 * End
		 */
		return [fileName, quality];
	}
};
