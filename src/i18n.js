const fs = require("node:fs");
const path = require("node:path");

const LOCALES_DIR = path.join(__dirname, "locales");
const AVAILABLE_LOCALES = ["ru", "en", "zh"];
const DEFAULT_LOCALE = "ru";

let currentLocale = DEFAULT_LOCALE;
let translations = {};

function loadLocale(locale) {
	if (!AVAILABLE_LOCALES.includes(locale)) {
		locale = DEFAULT_LOCALE;
	}
	const filePath = path.join(LOCALES_DIR, `${locale}.json`);
	try {
		translations = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		currentLocale = locale;
	} catch {
		translations = {};
		currentLocale = DEFAULT_LOCALE;
	}
}

function t(key, fallback) {
	return translations[key] ?? fallback ?? key;
}

function setLocale(locale) {
	if (AVAILABLE_LOCALES.includes(locale)) {
		loadLocale(locale);
		return true;
	}
	return false;
}

function getLocale() {
	return currentLocale;
}

function getAvailableLocales() {
	return AVAILABLE_LOCALES;
}

loadLocale(DEFAULT_LOCALE);

module.exports = {
	t,
	setLocale,
	getLocale,
	getAvailableLocales,
};
