const fetch = require("node-fetch");
const { getManifest } = require("../m3u8Utils");
const { selectVideoQuality } = require("../dialogue");
const URL = require("node:url");
const { downloadFile } = require("../downloadFile");

module.exports = {
    mayUse: url => regex_rutube.test(url),

    loadVideo: async cfg => {
        const m = regex_rutube.exec(cfg.url);
        const resp = await fetch(
            `https://rutube.ru/api/play/options/${m[1]}/?no_404=true&referer=https%3A%2F%2Frutube.ru`
        );
        if (!resp.ok)
            throw new Error(
                `Не удалось загрузить информацию о видео: ${cfg.url} \r\n ${resp.status} ${resp.statusText}`
            );

        const json = await resp.json();
        cfg.title = cfg.title ?? json.title;
        const videoInfo = await getManifest(
            json["video_balancer"]["m3u8"],
            "get video info:"
        );

        process.title = "DOWNLOAD: " + cfg.title;
        const [m3u8, quality] = await selectVideoQuality(
            cfg,
            videoInfo["playlists"]
        );

        // Получаем ссылку для составления будущих ссылок на сегмент
        const myURL = URL.parse(m3u8);
        const pathname = myURL.pathname.split("/");
        pathname.pop();
        const urlPrefix =
            myURL.protocol + "//" + myURL.host + "/" + pathname.join("/") + "/";

        // Получаем плейлист с сегментами
        const segmentsInfo = await getManifest(m3u8, "get segments info:");
        const segmentsUrls = segmentsInfo.segments.map(
            segment => urlPrefix + segment["uri"]
        );

        const name = await downloadFile(cfg, segmentsUrls);
        return [name, quality];
    },
};

const regex_rutube = /^https?:\/\/rutube\.ru\/video\/(\w+)/;
