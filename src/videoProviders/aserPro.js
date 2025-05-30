const path = require("node:path");
const { downloadFile } = require("../downloadFile");
const { selectVideoQuality } = require("../dialogue");
const { uuid9 } = require("../uid");
const { getManifest } = require("../m3u8Utils");

module.exports = {
    mayUse: url => regexAserPro.test(url),

    loadVideo: async function (cfg) {
        const videoInfo = await getManifest(cfg.url, "get video info:");
        cfg.title = cfg.title ?? uuid9();
        const [playlist, quality] = await selectVideoQuality(
            cfg,
            videoInfo["playlists"]
        );

        const segmentsUrl = path.join(path.dirname(cfg.url), playlist);

        const segmentsInfo = await getManifest(
            segmentsUrl,
            "get segments info:"
        );
        const segmentsBase = path.dirname(segmentsUrl);
        const segmentsUrls = segmentsInfo["segments"].map(segment =>
            path.join(segmentsBase, segment["uri"])
        );

        const name = await downloadFile(cfg, segmentsUrls);
        return [name, quality];
    },
};

const regexAserPro = /^https?:\/\/aser\.pro\/content\/.+?\/hls\/index.m3u8$/;
