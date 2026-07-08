const SUPPORTED_FORMATS = {
	mp4:  { label: "MP4",  ext: "mp4",  remux: true },
	mkv:  { label: "MKV",  ext: "mkv",  remux: true },
	avi:  { label: "AVI",  ext: "avi",  remux: true },
	mov:  { label: "MOV",  ext: "mov",  remux: true },
	webm: { label: "WebM", ext: "webm", remux: true },
};

exports.SUPPORTED_FORMATS = SUPPORTED_FORMATS;

exports.isValidFormat = format => format in SUPPORTED_FORMATS;

exports.getExt = format => SUPPORTED_FORMATS[format]?.ext ?? "mp4";
