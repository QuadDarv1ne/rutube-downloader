const m3u8Parser = require("m3u8-parser");
const fetch = require("node-fetch");

const DEFAULT_TIMEOUT = 60000;

async function getText(url, msg = "fetch failed:", options = {}, timeout = DEFAULT_TIMEOUT) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		const resp = await fetch(url, { ...options, signal: controller.signal });
		if (!resp.ok) throw new Error(`${msg} ${resp.status} ${resp.statusText}`);
		return await resp.text();
	} finally {
		clearTimeout(timer);
	}
}

exports.getManifest = async function (url, msg, options = {}) {
	const headers = options.headers || {};
	const manifestOptions = {
		headers: {
			...headers,
			"Accept": "*/*",
		},
	};
	const text = await getText(url, msg, manifestOptions);

	const m3u8 = new m3u8Parser.Parser();
	m3u8.push(text);
	m3u8.end();
	return m3u8.manifest;
};
