const m3u8Parser = require("m3u8-parser");
const fetch = require("node-fetch");
const { configure } = require("./configure");

async function getText(url, msg = "fetch failed:", options = {}, timeout) {
	const effectiveTimeout = timeout ?? configure.manifestTimeout;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), effectiveTimeout);
	let onAbort;
	if (options.signal) {
		onAbort = () => controller.abort();
		options.signal.addEventListener("abort", onAbort);
	}
	try {
		const resp = await fetch(url, { ...options, signal: controller.signal });
		if (!resp.ok) throw new Error(`${msg} ${resp.status} ${resp.statusText}`);
		return await resp.text();
	} finally {
		clearTimeout(timer);
		if (options.signal && onAbort) {
			options.signal.removeEventListener("abort", onAbort);
		}
	}
}

exports.getManifest = async function (url, msg, options = {}) {
	const headers = options.headers || {};
	const manifestOptions = {
		headers: {
			...headers,
			"Accept": "*/*",
		},
		signal: options.signal,
	};
	const text = await getText(url, msg, manifestOptions);

	const m3u8 = new m3u8Parser.Parser();
	m3u8.push(text);
	m3u8.end();
	return m3u8.manifest;
};
