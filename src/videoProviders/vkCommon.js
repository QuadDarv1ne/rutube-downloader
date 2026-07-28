const { fetchWithTimeout } = require("./fetchTimeout");
const { configure } = require("../configure");
const { getManifest } = require("../m3u8Utils");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile } = require("../downloadFile");
const { createDir, deleteFiles } = require("../fsUtils");
const { getProgress } = require("../progress");
const { delay } = require("../downloadFile");
const { sanitizeTitle } = require("./titleUtils");
const { t } = require("../i18n");
const _colors = require("ansi-colors");
const fs = require("node:fs");
const path = require("node:path");

const browserHeaders = configure.browserHeaders;

const cookieReg = /([^=]+)=([^;]+)/;
const cookieDomainReg = /domain=([^;]+)/;

/**
 * Парсит Set-Cookie заголовки в объект по доменам
 */
function extractCookies(setCookie, cookies = {}, domain) {
	if (!setCookie || !Array.isArray(setCookie)) return cookies;
	for (const pair of setCookie) {
		const res = cookieReg.exec(pair);
		if (!res) continue;
		const domainRes = cookieDomainReg.exec(pair);
		const cookieDomain = domainRes?.length > 0 ? domainRes[1] : domain;

		if (!cookies[cookieDomain]) cookies[cookieDomain] = {};

		if (res[2] === "DELETED") {
			delete cookies[cookieDomain][res[1]];
		} else {
			cookies[cookieDomain][res[1]] = res[2];
		}
	}
	return cookies;
}

/**
 * Кодирует куки для отправки в заголовке Cookie
 */
function encodeCookies(c, domain) {
	return Object.entries(c[domain] ?? {})
		.map(([key, value]) => `${key}=${value}`)
		.join("; ");
}

/**
 * Получает сегменты из манифеста VK
 */
async function fetchVkSegments(hlsRequestUrl, options, quality) {
	const hls = await getManifest(hlsRequestUrl, t("error.cannotGetVideo"), options);
	const playlists = hls["playlists"];
	if (!playlists || !playlists.length) return null;

	const [playlist] = await selectVideoQuality({ quality: quality || "best" }, playlists);
	const myURL = new URL(hlsRequestUrl);
	const segmentsBase = new URL(playlist, myURL).href;

	const segmentsInfo = await getManifest(segmentsBase, t("error.cannotGetSegments"), options);
	if (!segmentsInfo.segments || !segmentsInfo.segments.length) return null;

	return {
		segments: segmentsInfo.segments.map(segment => new URL(segment["uri"], segmentsBase).href),
		base: segmentsBase
	};
}

/**
 * Стриминговое скачивание VK Live — скачивает сегменты сразу при обнаружении
 */
async function downloadLiveStream(hlsRequestUrl, cfg, options) {
	const hls = await getManifest(hlsRequestUrl, t("error.cannotGetVideo"), options);
	const playlists = hls["playlists"];
	if (!playlists || !playlists.length) {
		throw new Error(t("error.cannotGetVideo") + cfg.url);
	}

	const [playlist] = await selectVideoQuality({ quality: cfg.quality || "best" }, playlists);
	const myURL = new URL(hlsRequestUrl);
	const segmentsBase = new URL(playlist, myURL).href;

	cfg.video = path.join(cfg.video, cfg.title);
	await createDir(cfg.video);
	await deleteFiles(/^segment-.*\.\w+$/, cfg.video);

	const knownSegments = new Set();
	const downloadedFiles = [];
	let segmentCounter = 0;
	let staleCount = 0;
	const maxStaleChecks = 10;
	const refreshInterval = 500;
	const maxParallel = cfg.parallelNum || 5;

	process.title = t("cli.download") + " " + cfg.title;
	console.log("\u00A0");
	console.log(
		t("cli.download").padStart(configure.padText, " "),
		_colors.yellowBright(cfg.title),
		"\n"
	);

	const progress = getProgress();
	const liveMaxSegments = 500;
	progress.start(liveMaxSegments, 0, { filename: " ", totalBytes: 0 });
	let totalBytes = 0;

	const signal = cfg.signal;
	if (signal?.aborted) throw new Error(t("error.downloadCancelled"));

	console.log(`[VK Live] Streaming — refreshing every ${refreshInterval}ms, ${maxParallel} parallel downloads`);

	while (staleCount < maxStaleChecks) {
		if (signal?.aborted) {
			console.log(`[VK Live] Download cancelled by user`);
			break;
		}
		let segmentsInfo;
		try {
			segmentsInfo = await getManifest(segmentsBase, t("error.cannotGetSegments"), options);
		} catch (e) {
			staleCount++;
			console.log(`[VK Live] Manifest fetch failed (stale #${staleCount}/${maxStaleChecks}): ${e.message?.substring(0, 120)}`);
			await delay(refreshInterval);
			continue;
		}

		if (!segmentsInfo.segments || !segmentsInfo.segments.length) {
			staleCount++;
			console.log(`[VK Live] Empty manifest (stale #${staleCount}/${maxStaleChecks})`);
			await delay(refreshInterval);
			continue;
		}

		const allSegUrls = segmentsInfo.segments.map(s => new URL(s["uri"], segmentsBase).href);
		const newSegUrls = allSegUrls.filter(url => !knownSegments.has(url));

		if (newSegUrls.length > 0) {
			staleCount = 0;

			// Download new segments immediately in parallel batches
			for (let i = 0; i < newSegUrls.length; i += maxParallel) {
				const batch = newSegUrls.slice(i, i + maxParallel);
				const batchStart = segmentCounter + 1;

				await Promise.allSettled(batch.map((segUrl, j) => {
					const idx = batchStart + j;
					const ext = path.extname(segUrl.split("?")[0]) || ".ts";
					const filePath = path.join(cfg.video, "segment-" + `${idx}`.padStart(10, "0") + ext);
					return require("../downloadFile").downloadSegment(segUrl, filePath, options, idx, signal).then(err => {
						if (!err) {
							knownSegments.add(segUrl);
							downloadedFiles.push(filePath);
							try { totalBytes += fs.statSync(filePath).size; } catch {}
						} else {
							console.log(_colors.yellowBright(`[VK Live] Segment #${idx} failed: ${err.message}`));
						}
					});
				}));

				segmentCounter += batch.length;

				const displayTotal = Math.max(segmentCounter, downloadedFiles.length);
				if (displayTotal > liveMaxSegments) progress.setTotal(displayTotal + 50);
				progress.update(downloadedFiles.length, { filename: " ", totalBytes });
				if (typeof cfg.onProgress === "function") {
					cfg.onProgress({ stage: "segments", current: downloadedFiles.length, total: displayTotal });
				}
			}

			console.log(`[VK Live] ${downloadedFiles.length}/${segmentCounter} segments downloaded (${newSegUrls.length} new)`);
		} else {
			staleCount++;
			if (staleCount >= maxStaleChecks) {
				console.log(`[VK Live] Stream ended (${maxStaleChecks} consecutive stale checks)`);
			}
		}

		await delay(refreshInterval);
	}

	if (!downloadedFiles.length) {
		progress.stop();
		throw new Error(t("error.cannotGetSegmentList") + cfg.url);
	}

	// Sort files by segment number to ensure correct order
	downloadedFiles.sort();

	progress.update(downloadedFiles.length, { filename: " ", totalBytes });
	progress.stop();

	console.log(`[VK Live] All ${downloadedFiles.length} segments downloaded, merging...`);

	if (typeof cfg.onProgress === "function")
		cfg.onProgress({ stage: "merge" });

	const videoFileName = await require("../downloadFile").mergeAndConvert(cfg, downloadedFiles, cfg.title);

	console.log("\u00A0");
	console.log(_colors.yellowBright(t("cli.done")));
	console.log("".padEnd(configure.padLine, "_"));

	return [videoFileName, null];
}

/**
 * Выполняет цепочку редиректов VK, собирая куки
 */
async function followVkRedirects(startUrl, maxRedirects = 10) {
	let cookies = {};
	let currentUrl = startUrl;

	for (let i = 0; i < maxRedirects; i++) {
		const resp = await fetchWithTimeout(currentUrl, {
			redirect: "manual",
			headers: browserHeaders,
		});

		cookies = extractCookies(resp.headers.raw()["set-cookie"], cookies, ".vkvideo.ru");

		if (resp.status < 300 || resp.status >= 400) {
			if (!resp.ok) {
				throw new Error(t("error.cannotLoadVideoPage") + currentUrl + ` (${resp.status})`);
			}
			return { html: await resp.text(), cookies, finalUrl: currentUrl };
		}

		const location = resp.headers.get("location");
		if (!location) {
			throw new Error(t("error.cannotLoadVideoPage") + currentUrl + ` (redirect without location)`);
		}
		currentUrl = new URL(location, currentUrl).href;
	}

	throw new Error(t("error.cannotLoadVideoPage") + startUrl + ` (too many redirects)`);
}

/**
 * Парсит initial-state JSON из HTML страницы
 */
function parseInitialState(html) {
	const match = html.match(/<script\s+type='text\/plain'\s+id='initial-state'>([\s\S]*?)<\/script>/i);
	if (!match) return null;
	try {
		return JSON.parse(match[1]);
	} catch (e) {
		throw new Error("Failed to parse VK Live initial state: " + (e.message || e));
	}
}

module.exports = {
	extractCookies,
	encodeCookies,
	fetchVkSegments,
	downloadLiveStream,
	followVkRedirects,
	parseInitialState,
	browserHeaders,
};
