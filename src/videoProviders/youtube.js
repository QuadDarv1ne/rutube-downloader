const path = require("node:path");
const fs = require("node:fs/promises");
const youtubedl = require("youtube-dl-exec");
const { createDir } = require("../fsUtils");
const { sanitizeTitle } = require("./titleUtils");
const { t } = require("../i18n");

const regex_youtube = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]+/;

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
			const lineTrimmed = line.trim();
			if (lineTrimmed && (lineTrimmed.includes("[download]") || lineTrimmed.includes("%") || /^\d+\.?\d*%/.test(lineTrimmed))) {
				send(lineTrimmed);
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
			if (cfg.signal && cfg.signal.aborted) {
				throw new Error(t("error.downloadCancelled"));
			}
			send(t("youtube.fetchingInfo"));
			let info;
			const slowHintTimer = setTimeout(() => {
				send(t("youtube.slowHint"));
			}, 30000);
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
			if (cfg.signal && cfg.signal.aborted) {
				throw new Error(t("error.downloadCancelled"));
			}
			const title = cleanTitle(sanitizeTitle(info.title));
			cfg.title = title;
			cfg.video = path.join(cfg.video, title);
			await createDir(cfg.video);

			send(t("youtube.downloading"));
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
			const outFormat = cfg.format || "mp4";
			if (outFormat !== "mp4" && qualityOpts.mergeOutputFormat) {
				downloadFlags.mergeOutputFormat = outFormat;
			} else if (qualityOpts.mergeOutputFormat) {
				downloadFlags.mergeOutputFormat = qualityOpts.mergeOutputFormat;
			}
			const subprocess = youtubedl.exec(cfg.url, downloadFlags);
			attachProgressStream(subprocess.stderr, send);
			if (subprocess.stdout) attachProgressStream(subprocess.stdout, send);

			let abortHandler;
			if (cfg.signal) {
				abortHandler = () => {
					try { subprocess.kill("SIGTERM"); } catch {}
				};
				cfg.signal.addEventListener("abort", abortHandler);
			}

			try {
				await subprocess;
			} finally {
				if (cfg.signal && abortHandler) {
					cfg.signal.removeEventListener("abort", abortHandler);
				}
			}
		} catch (e) {
			if (cfg.signal && cfg.signal.aborted) {
				throw new Error(t("error.downloadCancelled"));
			}
			const msg = e.message || String(e);
			if (msg.includes("ENOENT") || msg.includes("spawn") || msg.includes("not found")) {
				throw new Error(t("error.ytdlpNotFound"));
			}
			throw new Error("YouTube: " + (msg.length > 120 ? msg.slice(0, 120) + "…" : msg));
		}

		const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mkv", ".mov", ".avi", ".flv"]);
		const entries = await fs.readdir(cfg.video, { withFileTypes: true });
		const videoFiles = entries
			.filter(e => e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
			.map(e => e.name);
		if (videoFiles.length === 0) throw new Error(t("error.cannotSaveVideo"));
		return [videoFiles[0], null];
	},
};
