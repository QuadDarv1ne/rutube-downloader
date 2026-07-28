const path = require("node:path");
const { getManifest } = require("../m3u8Utils");
const { downloadFile } = require("../downloadFile");
const { sanitizeTitle } = require("./titleUtils");
const { t } = require("../i18n");
const { fetchWithTimeout } = require("./fetchTimeout");
const { extractCookies, encodeCookies, fetchVkSegments, downloadLiveStream, followVkRedirects, parseInitialState, browserHeaders } = require("./vkCommon");


const liveDomains = "(?:(?:www\.)?(?:live\.vkvideo\.ru|live\.vkplay\.ru|vkplay\.live))";
const regexRecord = new RegExp(`^https?://${liveDomains}/([^/]+)/record/([a-f0-9-]+)`);
const regexChannel = new RegExp(`^https?://${liveDomains}/([^/]+)$`);


async function downloadRecord(cfg, recordData, hlsHeaders) {
	const playerUrls = recordData?.data?.[0]?.playerUrls;
	if (!playerUrls) {
		throw new Error(t("error.vkLiveNoPlayerUrls"));
	}

	const hlsEntry = playerUrls.find(u => u.type === "ondemand_hls");
	if (!hlsEntry?.url) {
		throw new Error(t("error.hlsNotFound") + "ondemand_hls");
	}

	cfg.title = sanitizeTitle(cfg.title, recordData.data[0].title || recordData.title || cfg.title);

	const hlsRequestUrl = hlsEntry.url;
	const options = { headers: hlsHeaders || browserHeaders };

	console.log(`[VK Live Record] Collecting segments from manifest...`);

	const result = await fetchVkSegments(hlsRequestUrl, options, cfg.quality);
	if (!result || !result.segments.length) {
		throw new Error(t("error.cannotGetSegmentList") + cfg.url);
	}

	console.log(`[VK Live Record] Total segments to download: ${result.segments.length}`);

	cfg.video = path.join(cfg.video, cfg.title);

	const name = await downloadFile(cfg, result.segments, options);
	return [name, null];
}

async function handleRecordUrl(cfg, username, recordId) {
	const embedUrl = `https://live.vkvideo.ru/app/embed/${username}/${recordId}`;

	let cookies = {};
	let finalUrl = embedUrl;
	let currentUrl = embedUrl;
	for (let i = 0; i < 10; i++) {
		const resp = await fetchWithTimeout(currentUrl, {
			redirect: "manual",
			headers: browserHeaders,
		});

		cookies = extractCookies(resp.headers.raw()["set-cookie"], cookies, ".vkvideo.ru");

		if (resp.status < 300 || resp.status >= 400) {
			if (!resp.ok) {
				throw new Error(t("error.cannotLoadVideoPage") + finalUrl + ` (${resp.status})`);
			}
			finalUrl = currentUrl;
			const html = await resp.text();
			const state = parseInitialState(html);
			if (!state) {
				throw new Error(t("error.vkLiveNoPlayerUrls"));
			}

			const hlsHeaders = {
				...browserHeaders,
				Accept: "*/*",
				Referer: embedUrl,
				Origin: "https://live.vkvideo.ru",
				Cookie: encodeCookies(cookies, ".vkvideo.ru"),
			};

			// Check if this is a live stream first
			const stream = state?.stream?.stream?.data?.stream;
			if (stream) {
				console.log(`[VK Live] Record URL is currently live — downloading stream...`);
				const playerUrls = stream.playerUrls || stream?.streamUrls;
				if (playerUrls && Array.isArray(playerUrls)) {
					const hlsEntry = playerUrls.find(u => u.type === "ondemand_hls" || u.type === "hls" || u.type === "hls_live");
					if (hlsEntry?.url) {
						cfg.title = stream.title || cfg.title;
						return downloadLiveStream(cfg, hlsEntry.url, { headers: hlsHeaders });
					}
				}
			}

			const recordData = state?.record?.currentRecord?.data;
			if (!recordData?.data?.[0]?.playerUrls) {
				throw new Error(t("error.vkLiveNoPlayerUrls"));
			}

			return downloadRecord(cfg, recordData, hlsHeaders);
		}

		const location = resp.headers.get("location");
		if (!location) {
			throw new Error(t("error.cannotLoadVideoPage") + currentUrl + ` (redirect without location)`);
		}
		currentUrl = new URL(location, currentUrl).href;
	}

	throw new Error(t("error.cannotLoadVideoPage") + embedUrl + ` (too many redirects)`);
}

async function tryDownloadLiveStream(cfg, username, channelCookies) {
	const embedUrl = `https://live.vkvideo.ru/app/embed/${username}`;
	let cookies = { ...(channelCookies || {}) };

	const embedResp = await fetchWithTimeout(embedUrl, {
		redirect: "manual",
		headers: browserHeaders,
	});
	if (!embedResp.ok) return null;

	cookies = extractCookies(embedResp.headers.raw()["set-cookie"], cookies, ".vkvideo.ru");

	const embedHtml = await embedResp.text();
	const embedState = parseInitialState(embedHtml);
	if (!embedState) return null;

	const stream = embedState?.stream?.stream?.data?.stream;
	if (!stream) {
		console.log(`[VK Live] No stream data found in embed page`);
		console.log(`[VK Live] Available keys: ${Object.keys(embedState?.stream?.stream?.data || {})}`);
		return null;
	}

	console.log(`[VK Live] Live stream data found!`);
	const playerUrls = stream.playerUrls || stream?.streamUrls;
	if (playerUrls && Array.isArray(playerUrls)) {
		const hlsEntry = playerUrls.find(u => u.type === "ondemand_hls" || u.type === "hls" || u.type === "hls_live");
		if (hlsEntry?.url) {
			cfg.title = stream.title || cfg.title;
			console.log(`[VK Live] Downloading live stream: "${cfg.title}"`);
			const hlsHeaders = {
				...browserHeaders,
				Accept: "*/*",
				Referer: embedUrl,
				Origin: "https://live.vkvideo.ru",
				Cookie: encodeCookies(cookies, ".vkvideo.ru"),
			};
			return downloadLiveStream(cfg, hlsEntry.url, { headers: hlsHeaders });
		}
	}

	// Log available keys for debugging
	console.log(`[VK Live] Stream keys: ${Object.keys(stream)}`);
	for (const k of Object.keys(stream)) {
		const v = stream[k];
		if (v && typeof v === "string" && (v.includes("m3u8") || v.includes(".ts"))) {
			console.log(`[VK Live] Found HLS-like field: ${k} = ${v.slice(0, 200)}`);
		}
	}

	return null;
}

async function handleChannelUrl(cfg, username) {
	const channelUrl = `https://live.vkvideo.ru/${username}?tab=records`;

	let cookies = {};
	let channelResp;
	let currentUrl = channelUrl;
	for (let i = 0; i < 10; i++) {
		channelResp = await fetchWithTimeout(currentUrl, {
			redirect: "manual",
			headers: browserHeaders,
		});

		cookies = extractCookies(channelResp.headers.raw()["set-cookie"], cookies, ".vkvideo.ru");

		if (channelResp.status < 300 || channelResp.status >= 400) break;

		const location = channelResp.headers.get("location");
		if (!location) {
			throw new Error(t("error.cannotLoadVideoPage") + currentUrl + ` (redirect without location)`);
		}
		currentUrl = new URL(location, currentUrl).href;
	}

	if (!channelResp.ok) {
		throw new Error(t("error.cannotLoadVideoPage") + channelUrl + ` (${channelResp.status})`);
	}

	const html = await channelResp.text();
	const state = parseInitialState(html);
	if (!state) {
		throw new Error(t("error.vkLiveNoPlayerUrls"));
	}

	const slots = state?.streamSlots?.channelPage?.data;
	const isLive = slots?.some(s => s.isOnline);
	if (isLive) {
		console.log(`[VK Live] Channel is currently LIVE — attempting to download stream...`);
		const result = await tryDownloadLiveStream(cfg, username, cookies);
		if (result) return result;
		console.log(`[VK Live] Live stream download failed, falling back to past records`);
	}

	const records = state?.record?.records?.data?.data;
	if (!records || !records.length) {
		if (isLive) {
			throw new Error(t("error.vkLiveLiveStreamNotSupported"));
		}
		throw new Error(t("error.vkLiveNoRecords"));
	}

	console.log(`[VK Live] Found ${records.length} past record(s)`);

	const latest = records[0];
	const recordUrl = `https://live.vkvideo.ru/${username}/record/${latest.id}`;
	const embedUrl = `https://live.vkvideo.ru/app/embed/${username}/${latest.id}`;
	console.log(`[VK Live] Most recent: "${latest.title}" (duration: ${Math.floor(latest.duration / 60)} min)`);

	let embedResp;
	currentUrl = embedUrl;
	for (let i = 0; i < 10; i++) {
		embedResp = await fetchWithTimeout(currentUrl, {
			redirect: "manual",
			headers: browserHeaders,
		});

		cookies = extractCookies(embedResp.headers.raw()["set-cookie"], cookies, ".vkvideo.ru");

		if (embedResp.status < 300 || embedResp.status >= 400) break;

		const location = embedResp.headers.get("location");
		if (!location) {
			throw new Error(t("error.cannotLoadVideoPage") + currentUrl + ` (redirect without location)`);
		}
		currentUrl = new URL(location, currentUrl).href;
	}

	if (!embedResp.ok) {
		throw new Error(t("error.cannotLoadVideoPage") + embedUrl + ` (${embedResp.status})`);
	}

	const embedHtml = await embedResp.text();
	const embedState = parseInitialState(embedHtml);
	if (!embedState) {
		throw new Error(t("error.vkLiveNoPlayerUrls"));
	}

	const hlsHeaders = {
		...browserHeaders,
		Accept: "*/*",
		Referer: embedUrl,
		Origin: "https://live.vkvideo.ru",
		Cookie: encodeCookies(cookies, ".vkvideo.ru"),
	};

	const recordData = embedState?.record?.currentRecord?.data;
	if (!recordData?.data?.[0]?.playerUrls) {
		throw new Error(t("error.vkLiveNoPlayerUrls"));
	}

	return downloadRecord(cfg, recordData, hlsHeaders);
}

async function loadVideo(cfg) {
	try {
		const recordMatch = regexRecord.exec(cfg.url);
		const channelMatch = regexChannel.exec(cfg.url);

		if (recordMatch) {
			return await handleRecordUrl(cfg, recordMatch[1], recordMatch[2]);
		}

		if (channelMatch) {
			return await handleChannelUrl(cfg, channelMatch[1]);
		}

		throw new Error(t("error.cannotParseUrl") + cfg.url);
	} catch (e) {
		if (e instanceof Error) throw e;
		throw new Error(t("error.vkLiveLoadError") + cfg.url);
	}
}

module.exports = {
	mayUse: url => regexRecord.test(url) || regexChannel.test(url),
	loadVideo,
};
