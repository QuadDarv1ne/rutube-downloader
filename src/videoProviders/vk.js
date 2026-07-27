const path = require("node:path");
const fs = require("node:fs");
const _colors = require("ansi-colors");
const { getManifest } = require("../m3u8Utils");
const { configure } = require("../configure");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile, downloadSegment, mergeAndConvert, delay } = require("../downloadFile");
const { createDir, deleteFiles } = require("../fsUtils");
const { getProgress } = require("../progress");
const { sanitizeTitle } = require("./titleUtils");
const { fetchWithTimeout } = require("./fetchTimeout");
const { t } = require("../i18n");

/**
 * Видео от пользователя
 * https://vk.com/video643853031_456271286
 * https://vk.ru/video643853031_456271286
 * https://vkvideo.ru/video643853031_456271286
 *
 * Видео от канала
 * https://vk.com/video-18255722_456244249
 * https://vk.ru/video-18255722_456244249
 * https://vkvideo.ru/video-18255722_456244249
 *
 * Короткие видео (клипы)
 * https://vk.com/clip30014565_456240946
 * https://vkvideo.ru/clip-30014565_456240946
 *
 * Прямые трансляции (live)
 * https://vkvideo.ru/live-183207497_456242848
 * https://vk.com/live-183207497_456242848
 *
 * Поддержка ссылки с плейлиста. Пример:
 * https://vkvideo.ru/playlist/62764098_2/video62764098_456239055
 *
 * Ссылки с z-параметром (из ленты, поиска)
 * https://vk.com/video?z=video-387766_456242764
 * https://vk.com/feed?z=video-43215063_166094326
 *
 * Embed URL
 * https://vk.com/video_ext.php?oid=-22822305&id=456242110
 * https://vkvideo.ru/video_ext.php?oid=646754736&id=456239022
 *
 * Поддомены
 * https://m.vk.com/video-123456_789012
 * https://new.vk.com/video-123456_789012
 * https://vksport.vkvideo.ru/video-124096712_456240773
 *
 */
const regexVkStandard = /^https?:\/\/(?:(?:[a-z]+\.)?vk(?:video)?\.(?:ru|com))\/(?:playlist\/[^/]+\/)?(?:video|live-|clip)(-?\d+_\d+)/;
const regexVkZParam = /^https?:\/\/(?:(?:[a-z]+\.)?vk(?:video)?\.(?:ru|com))\/(?:.*?[?&]z=)(?:video|clip)(-?\d+_\d+)/;
const regexVkEmbed = /^https?:\/\/(?:(?:[a-z]+\.)?vk(?:video)?\.(?:ru|com))\/video_ext\.php\?/;
const regexVkChannel = /^https?:\/\/(?:(?:[a-z]+\.)?vk(?:video)?\.(?:ru|com))\/(?:(?:video\/)?@[\w.\-]+(?:\/\w+)?)$/;

function extractVideoId(url) {
	let m;
	if ((m = regexVkStandard.exec(url))) return m[1];
	if ((m = regexVkZParam.exec(url))) return m[1];
	if (regexVkEmbed.test(url)) {
		const u = new URL(url);
		const oid = u.searchParams.get("oid");
		const id = u.searchParams.get("id");
		if (oid && id) return `${oid}_${id}`;
	}
	return null;
}

function isChannelUrl(url) {
	return regexVkChannel.test(url);
}

function isLiveUrl(url) {
	return /\/live-/.test(url) && !/video_ext\.php/.test(url);
}

const extractCookies = function(setCookie, cookies = {}, domain) {
	if (!setCookie || !Array.isArray(setCookie)) return cookies;
	for (let pair of setCookie) {
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

const cookieReg = /([^=]+)=([^;]+)/;
const cookieDomainReg = /domain=([^;]+)/;

const encodeCookies = (c, domain) =>
	Object.entries(c[domain] ?? {})
		.map(([key, value]) => `${key}=${value}`)
		.join("; ");

const browserHeaders = configure.browserHeaders;

/**
 * Получаем сегменты из манифеста VK
 */
async function fetchVkSegments(hlsRequestUrl, options) {
	const hls = await getManifest(hlsRequestUrl, t("error.cannotGetVideo"), options);
	const playlists = hls["playlists"];
	if (!playlists || !playlists.length) return null;
	
	const [playlist] = await selectVideoQuality({ quality: "best" }, playlists);
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

	const [playlist] = await selectVideoQuality({ quality: "best" }, playlists);
	const myURL = new URL(hlsRequestUrl);
	const segmentsBase = new URL(playlist, myURL).href;

	cfg.video = path.join(cfg.video, cfg.title);
	await createDir(cfg.video);
	await deleteFiles(/^segment-.*\.\w+$/, cfg.video);

	const knownSegments = new Set();
	const downloadedFiles = [];
	let segmentCounter = 0;
	let staleCount = 0;
	const maxStaleChecks = 10; // 10 × 500ms = 5s without new segments = stream ended
	const refreshInterval = 500; // 500ms between manifest refreshes
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
	let liveProgressDone = false;
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
					return downloadSegment(segUrl, filePath, options, idx, signal).then(err => {
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

				if (!liveProgressDone) {
					const displayTotal = Math.max(segmentCounter, downloadedFiles.length);
					if (displayTotal > liveMaxSegments) {
						progress.setTotal(displayTotal + 50);
					}
					progress.update(downloadedFiles.length, { filename: " ", totalBytes });
					if (typeof cfg.onProgress === "function") {
						cfg.onProgress({ stage: "segments", current: downloadedFiles.length, total: displayTotal });
					}
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

	liveProgressDone = true;
	progress.update(downloadedFiles.length, { filename: " ", totalBytes });
	progress.stop();

	console.log(`[VK Live] All ${downloadedFiles.length} segments downloaded, merging...`);

	if (typeof cfg.onProgress === "function")
		cfg.onProgress({ stage: "merge" });

	const videoFileName = await mergeAndConvert(cfg, downloadedFiles, cfg.title);

	console.log("\u00A0");
	console.log(_colors.yellowBright(t("cli.done")));
	console.log("".padEnd(configure.padLine, "_"));

	return [videoFileName, null];
}

module.exports = {
	mayUse: url => regexVkStandard.test(url) || regexVkZParam.test(url) || regexVkEmbed.test(url) || regexVkChannel.test(url),

	loadVideo: async cfg => {
		try {
			const getUrlResp = await fetchWithTimeout(cfg.url, {
				redirect: "manual",
				headers: browserHeaders,
			});

			if (getUrlResp.status >= 400) {
				throw new Error(t("error.cannotLoadVideoPage") + cfg.url + "\r\n\r\n" + getUrlResp.status + " " + getUrlResp.statusText);
			}

			const cookies = extractCookies(
				getUrlResp.headers.raw()["set-cookie"],
				{},
				".vkvideo.ru"
			);

			const location1 = getUrlResp.headers.get("location");
			if (!location1) throw new Error(t("error.cannotGetRedirect") + cfg.url);
			const autoLoginResp = await fetchWithTimeout(location1, {
				redirect: "manual",
				headers: browserHeaders,
			});
			extractCookies(
				autoLoginResp.headers.raw()["set-cookie"],
				cookies,
				".vk.com"
			);

			const location2 = autoLoginResp.headers.get("location");
			if (!location2) throw new Error(t("error.cannotGetRedirectStep2") + cfg.url);
			const anonymousLogin = await fetchWithTimeout(
				location2,
				{
					redirect: "manual",
					headers: {
						...browserHeaders,
						Cookie: encodeCookies(cookies, ".vkvideo.ru"),
					},
				}
			);
			extractCookies(
				anonymousLogin.headers.raw()["set-cookie"],
				cookies,
				".vkvideo.ru"
			);

			const location3 = anonymousLogin.headers.get("location");
			if (!location3) throw new Error(t("error.cannotGetRedirectStep3") + cfg.url);
			const getPage = await fetchWithTimeout(location3, {
				redirect: "manual",
				headers: {
					...browserHeaders,
					Cookie: encodeCookies(cookies, ".vkvideo.ru"),
				},
			});
			extractCookies(
				getPage.headers.raw()["set-cookie"],
				cookies,
				".vkvideo.ru"
			);

			// For channel URLs (@channel), the video ID comes from the redirect target
			const resolvedUrl = isChannelUrl(cfg.url) ? location3 : cfg.url;
			const videoId = extractVideoId(resolvedUrl);
			if (!videoId) {
				throw new Error(t("error.cannotParseUrl") + cfg.url);
			}
			// For live- URLs the owner ID must be sent with a leading minus
			const isLive = isLiveUrl(resolvedUrl);
			const finalId = isLive && videoId[0] !== "-" ? "-" + videoId : videoId;

			// Extract list parameter from URL if present
			let listParam = "";
			try {
				const urlObj = new URL(cfg.url);
				listParam = urlObj.searchParams.get("list") || "";
				if (listParam) {
					listParam = `&list=${encodeURIComponent(listParam)}`;
				}
			} catch {}

			const body =
				"al=1&autoplay=1&claim=&force_no_repeat=true&is_video_page=true&list=&module=direct&show_next=1&video=" +
				finalId + (isLive ? "&live=1" : "") + listParam;

			const headers = {
				...browserHeaders,
				Cookie: encodeCookies(cookies, ".vkvideo.ru"),
				"content-type": "application/x-www-form-urlencoded",
				origin: "https://vkvideo.ru",
				referer: cfg.url,
				accept: "*/*",
			};

			const vkVideoInfo = await fetchWithTimeout(
				"https://vkvideo.ru/al_video.php?act=show",
				{
					method: "POST",
					redirect: "manual",
					headers,
					body,
				}
			);

			if (!vkVideoInfo.ok) {
				throw new Error(t("error.cannotGetVideoInfoApi") + vkVideoInfo.status + " " + vkVideoInfo.statusText);
			}

			let text = await vkVideoInfo.textConverted();
			const json = JSON.parse(text.replace(/<!--/g, "").replace(/-->/g, ""));
			cfg.title = sanitizeTitle(cfg.title, json.payload?.[1]?.[0]);

			const options = { headers };

			if (typeof json.payload?.[1]?.[4]?.player !== "object") {
				throw new Error(
					t("error.cannotLoadVideoInfo") + cfg.url + "\r\n\r\n" + (json.payload?.[1]?.[0] ?? t("error.unknownError"))
				);
			}

			const playerParams = json.payload?.[1]?.[4]?.player?.params?.[0];
			const hlsUrl = playerParams?.hls
				|| playerParams?.hls_ondemand
				|| playerParams?.hls_live
				|| playerParams?.hls_live_dash;
			if (!hlsUrl) {
				throw new Error(t("error.cannotGetHlsLink") + cfg.url);
			}

			// Auto-detect live: URL has /live- prefix OR API returned a live-specific HLS field
			const isLiveStream = isLive || !!(playerParams?.hls_live || playerParams?.hls_live_dash);

			// For live streams, add live parameter and disable repeat
			let hlsRequestUrl = hlsUrl;
			if (isLiveStream) {
				const urlObj = new URL(hlsUrl);
				urlObj.searchParams.set('live', '1');
				urlObj.searchParams.set('live_no_repeat', '1');
				hlsRequestUrl = urlObj.toString();
			}

			// Live streams have dynamic HLS — segments are removed from manifest as they age
			if (isLiveStream) {
				console.log(`[VK] Detected live stream, switching to streaming download mode`);
				const result = await downloadLiveStream(hlsRequestUrl, cfg, options);
				return result;
			}

			// VOD: collect all segments, then download
			console.log(`[VK] Collecting segments from manifest...`);

			const result = await fetchVkSegments(hlsRequestUrl, options);
			if (!result || !result.segments.length) {
				throw new Error(t("error.cannotGetSegmentList") + cfg.url);
			}

			console.log(`[VK] Total segments to download: ${result.segments.length}`);

			cfg.video = path.join(cfg.video, cfg.title);

			const name = await downloadFile(cfg, result.segments, options);
			return [name, null];
		} catch (e) {
			if (e instanceof Error) throw e;
			throw new Error(t("error.vkLoadError") + cfg.url);
		}
	},
};
