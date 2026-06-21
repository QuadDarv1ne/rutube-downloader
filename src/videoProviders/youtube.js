const path = require("node:path");
const fs = require("node:fs");
const youtubedl = require("youtube-dl-exec");
const emojiStrip = require("emoji-strip");
const sanitize = require("sanitize-filename");
const { createDir } = require("../fsUtils");

const regex_youtube = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;

// Варианты качества для UI и соответствующие строки формата yt-dlp
const QUALITY_FORMATS = {
	best: {
		format: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
		mergeOutputFormat: "mp4",
	},
	1080: {
		format: "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
		mergeOutputFormat: "mp4",
	},
	720: {
		format: "bestvideo[height<=720]+bestaudio/best[height<=720]",
		mergeOutputFormat: "mp4",
	},
	480: {
		format: "bestvideo[height<=480]+bestaudio/best[height<=480]",
		mergeOutputFormat: "mp4",
	},
	360: {
		format: "bestvideo[height<=360]+bestaudio/best[height<=360]",
		mergeOutputFormat: "mp4",
	},
	audio: {
		format: "bestaudio",
		mergeOutputFormat: null,
	},
};

// Буфер для неполных строк из stderr; парсим последнюю строку с прогрессом
function attachProgressStream(stream, send) {
	if (!stream || !send) return;
	let buf = "";
	stream.setEncoding("utf8");
	stream.on("data", chunk => {
		buf += chunk;
		const lines = buf.split(/\r?\n/);
		buf = lines.pop() || "";
		for (const line of lines) {
			const t = line.trim();
			if (t && (t.includes("[download]") || t.includes("%") || /^\d+\.?\d*%/.test(t))) {
				send(t);
			}
		}
	});
	stream.on("end", () => {
		if (buf.trim()) send(buf.trim());
	});
}

// Убираем точки и прочие символы в конце названия, чтобы не было "....webm"
function cleanTitle(s) {
	return s.replace(/[.\s]+$/, "").trim() || "video";
}

module.exports = {
	mayUse: url => regex_youtube.test(url),

	loadVideo: async cfg => {
		const send = msg => typeof cfg.onProgress === "function" && cfg.onProgress({ stage: "download", message: msg });

		try {
			send("Получение информации о видео...");
			const slowHintTimer = setTimeout(() => {
				send("Долго нет ответа. Скорее всего, нужен VPN — без него видео не скачается.");
			}, 30000);
			let info;
			try {
				info = await youtubedl(cfg.url, {
					dumpSingleJson: true,
					noCheckCertificates: true,
					noWarnings: true,
					noPlaylist: true,
				});
			} finally {
				clearTimeout(slowHintTimer);
			}
			const rawTitle = sanitize(emojiStrip(info.title || "video")).replace(/\s+/g, " ").trim() || "video";
			const title = cleanTitle(rawTitle);
			cfg.title = title;
			cfg.video = path.join(cfg.video, title);
			await createDir(cfg.video);

			send("Загрузка...");
			const qualityKey = QUALITY_FORMATS[cfg.quality] ? cfg.quality : "best";
			const qualityOpts = QUALITY_FORMATS[qualityKey];
			const outputTemplate = path.join(cfg.video, title + ".%(ext)s");
			const downloadFlags = {
				output: outputTemplate,
				format: qualityOpts.format,
				noCheckCertificates: true,
				noWarnings: true,
				noPlaylist: true,
				newline: true,
			};
			if (qualityOpts.mergeOutputFormat) downloadFlags.mergeOutputFormat = qualityOpts.mergeOutputFormat;
			const subprocess = youtubedl.exec(cfg.url, downloadFlags);
			attachProgressStream(subprocess.stderr, send);
			if (subprocess.stdout) attachProgressStream(subprocess.stdout, send);
			await subprocess;
		} catch (e) {
			const msg = e.message || String(e);
			if (msg.includes("ENOENT") || msg.includes("spawn") || msg.includes("not found")) {
				throw new Error("yt-dlp не найден. Выполните npm install заново (для загрузки бинарника нужен доступ в интернет).");
			}
			throw new Error("YouTube: " + (msg.length > 120 ? msg.slice(0, 120) + "…" : msg));
		}

		const files = fs.readdirSync(cfg.video).filter(f => {
			const p = path.join(cfg.video, f);
			return fs.statSync(p).isFile();
		});
		if (files.length === 0) throw new Error("Не удалось сохранить видео");
		return [files[0], null];
	},
};
