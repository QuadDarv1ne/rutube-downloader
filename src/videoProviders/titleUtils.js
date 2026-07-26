const emojiStrip = require("emoji-strip");
const sanitize = require("sanitize-filename");
const { uuid9 } = require("../uid");

const translitMap = {
	"А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ё":"Yo","Ж":"Zh",
	"З":"Z","И":"I","Й":"Y","К":"K","Л":"L","М":"M","Н":"N","О":"O",
	"П":"P","Р":"R","С":"S","Т":"T","У":"U","Ф":"F","Х":"Kh","Ц":"Cz",
	"Ч":"Ch","Ш":"Sh","Щ":"Shh","Ъ":"''","Ы":"Y","Ь":"''","Э":"Eh",
	"Ю":"Yu","Я":"Ya",
	"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh",
	"з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o",
	"п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"cz",
	"ч":"ch","ш":"sh","щ":"shh","ъ":"'","ы":"y","ь":"","э":"eh",
	"ю":"yu","я":"ya",
};

function transliterate(text) {
	return text.split("").map(c => translitMap[c] || c).join("");
}

/**
 * Декодирует HTML-сущности (&#128187;, &amp;, &quot; и т.д.)
 * Работает в Node.js без DOM
 */
function decodeHtmlEntities(text) {
	if (!text) return text;
	// Use a simple regex-based decoder that works in Node.js
	return text
		.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
}

/**
 * Санитизация названия для файловой системы:
 * 1. Декодирует HTML-сущности (&#128187; → 📷, &amp; → &)
 * 2. Удаляет emoji
 * 3. Транслитерирует кириллицу (для совместимости со старым ffmpeg)
 * 4. Убирает все non-ASCII символы (остатки Unicode)
 * 5. Убирает недопустимые символы для ФС
 * 6. Заменяет множественные пробелы
 */
exports.sanitizeTitle = (raw, fallback) => {
	let title = raw ?? fallback ?? uuid9();
	// Decode HTML entities first
	title = decodeHtmlEntities(title);
	// Strip emojis
	title = emojiStrip(title);
	// Transliterate Cyrillic to ASCII (ffmpeg compatibility)
	title = transliterate(title);
	// Remove any remaining non-ASCII characters
	title = title.replace(/[^\x00-\x7F]/g, "");
	// Sanitize for filesystem
	title = sanitize(title);
	// Clean up whitespace
	title = title.replace(/\s+/g, " ").trim();
	return title || "video";
};
