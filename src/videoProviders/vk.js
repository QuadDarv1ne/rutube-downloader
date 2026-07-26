const path = require("node:path");
const { getManifest } = require("../m3u8Utils");
const { configure } = require("../configure");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile } = require("../downloadFile");
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
 * Прямые трансляции (live)
 * https://vkvideo.ru/live-183207497_456242848
 * https://vk.com/live-183207497_456242848
 *
 * Поддержка ссылки с плейлиста. Пример:
 * https://vkvideo.ru/playlist/62764098_2/video62764098_456239055
 *
 */
const regexVk = /^https?:\/\/(?:vk|vkvideo)\.(?:ru|com)\/(?:playlist\/.+)?(?:video|live-)(-?\d+_\d+)/;

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

module.exports = {
	mayUse: url => regexVk.test(url),

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

			const m = regexVk.exec(cfg.url);
			if (!m) {
				throw new Error(t("error.cannotParseUrl") + cfg.url);
			}
			// For live- URLs the owner ID must be sent with a leading minus
			const isLive = /\/live-/.test(cfg.url);
			const videoId = isLive && m[1][0] !== "-" ? "-" + m[1] : m[1];
			const body =
				"al=1&autoplay=1&claim=&force_no_repeat=true&is_video_page=true&list=&module=direct&show_next=1&video=" +
				videoId;

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
			const json = JSON.parse(text.replace(/<!--/g, ""));
			cfg.title = sanitizeTitle(cfg.title, json.payload?.[1]?.[0]);

			const options = { headers };

			if (typeof json.payload?.[1]?.[4]?.player !== "object") {
				throw new Error(
					t("error.cannotLoadVideoInfo") + cfg.url + "\r\n\r\n" + (json.payload?.[1]?.[0] ?? t("error.unknownError"))
				);
			}

			const hlsUrl = json.payload?.[1]?.[4]?.player?.params?.[0]?.hls
				|| json.payload?.[1]?.[4]?.player?.params?.[0]?.hls_ondemand;
			if (!hlsUrl) {
				throw new Error(t("error.cannotGetHlsLink") + cfg.url);
			}
			const hls = await getManifest(
				hlsUrl,
				t("error.cannotGetVideo"),
				options
			);

			const playlists = hls["playlists"];
			if (!playlists || !playlists.length) {
				throw new Error(t("error.cannotGetVideoQualities") + cfg.url);
			}
			const [playlist, quality] = await selectVideoQuality(cfg, playlists);

			const myURL = new URL(hlsUrl);
			const segmentsBase = new URL(playlist, myURL).href;

			const segmentsInfo = await getManifest(
				segmentsBase,
				t("error.cannotGetSegments"),
				options
			);

			if (!segmentsInfo.segments || !segmentsInfo.segments.length) {
				throw new Error(t("error.cannotGetSegmentList") + cfg.url);
			}
			const segmentsUrls = segmentsInfo.segments.map(segment =>
				new URL(segment["uri"], segmentsBase).href
			);
			cfg.video = path.join(cfg.video, cfg.title);

			const name = await downloadFile(cfg, segmentsUrls, options);
			return [name, quality];
		} catch (e) {
			if (e instanceof Error) throw e;
			throw new Error(t("error.vkLoadError") + cfg.url);
		}
	},
};
