const m3u8Parser = require("m3u8-parser");
const fetch = require("node-fetch");

async function getText(url, msg = "fetch failed:", options = {}) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30000);
	try {
		const resp = await fetch(url, { ...options, signal: controller.signal });
		if (!resp.ok) throw new Error(`${msg} ${resp.status} ${resp.statusText}`);
		return await resp.text();
	} finally {
		clearTimeout(timeout);
	}
}

exports.getManifest = async function (url, msg, options) {
	const text = await getText(url, msg, options);

	const m3u8 = new m3u8Parser.Parser();
	m3u8.push(text);
	m3u8.end();
	return m3u8.manifest;
};
