const URL = require("node:url");
const path = require("node:path");
const fetch = require("node-fetch");
const { getManifest } = require("../m3u8Utils");
const { selectVideoQuality } = require("../dialogue");
const { downloadFile } = require("../downloadFile");

module.exports = {
    mayUse: url => regexVk.test(url),

    loadVideo: async cfg => {
        const getUrlResp = await fetch(cfg.url, {
            redirect: "manual",
            headers: browserHeaders,
        });
        const cookies = extractCookies(
            getUrlResp.headers.raw()["set-cookie"],
            {},
            ".vkvideo.ru"
        );

        const autoLoginResp = await fetch(getUrlResp.headers.get("location"), {
            redirect: "manual",
            headers: browserHeaders,
        });
        extractCookies(
            autoLoginResp.headers.raw()["set-cookie"],
            cookies,
            ".vk.com"
        );

        const anonymousLogin = await fetch(
            autoLoginResp.headers.get("location"),
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

        const getPage = await fetch(anonymousLogin.headers.get("location"), {
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
        const body =
            "al=1&autoplay=1&claim=&force_no_repeat=true&is_video_page=true&list=&module=direct&show_next=1&video=" +
            m[1];

        const headers = {
            ...browserHeaders,
            Cookie: encodeCookies(cookies, ".vkvideo.ru"),
            "content-type": "application/x-www-form-urlencoded",
            origin: "https://vkvideo.ru",
            referer: cfg.url,
            accept: "*/*",
        };

        const vkVideoInfo = await fetch(
            "https://vkvideo.ru/al_video.php?act=show",
            {
                method: "POST",
                redirect: "manual",
                headers,
                body,
            }
        );

        let text = await vkVideoInfo.textConverted();

        const json = JSON.parse(text.replace("<!--", ""));
        cfg.title = json.payload[1][0];

        const options = { headers };

        const hlsUrl = json.payload[1][4].player.params[0].hls;
        const hls = await getManifest(hlsUrl, "get vkVideo info", options);

        const [playlist, quality] = await selectVideoQuality(
            cfg,
            hls["playlists"]
        );

        const myURL = URL.parse(hlsUrl);
        const segmentsBase = myURL.protocol + "//" + myURL.host + playlist;

        const segmentsInfo = await getManifest(
            segmentsBase,
            "get vkVideo segments",
            options
        );

        const segmentsUrls = segmentsInfo["segments"].map(segment =>
            path.join(segmentsBase, segment["uri"])
        );

        const name = await downloadFile(cfg, segmentsUrls, options);
        return [name, quality];
    },
};

const regexVk = /^https?:\/\/vkvideo\.ru\/video(-\d+_\d+)/;

function extractCookies(setCookie, cookies = {}, domain) {
    for (let pair of setCookie) {
        const res = cookieReg.exec(pair);
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

const browserHeaders = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-encoding": "gzip, deflate, br, zstd",
    "sec-ch-ua":
        '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "Windows",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
};
