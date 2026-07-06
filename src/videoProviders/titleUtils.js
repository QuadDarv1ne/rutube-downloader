const emojiStrip = require("emoji-strip");
const sanitize = require("sanitize-filename");
const { uuid9 } = require("../uid");

exports.sanitizeTitle = (raw, fallback) =>
	sanitize(emojiStrip(raw ?? fallback ?? uuid9())).replace(/\s+/g, " ").trim() || "video";
