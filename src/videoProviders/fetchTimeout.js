const fetch = require("node-fetch");

const DEFAULT_TIMEOUT = 30000;

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

module.exports = { fetchWithTimeout };
