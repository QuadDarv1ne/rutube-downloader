const SUPPORTED_FORMATS = {
	mp4:  { label: "MP4",  ext: "mp4" },
	mkv:  { label: "MKV",  ext: "mkv" },
	avi:  { label: "AVI",  ext: "avi" },
	mov:  { label: "MOV",  ext: "mov" },
	webm: { label: "WebM", ext: "webm" },
};

const AUDIO_FORMATS = {
	mp3:  { label: "MP3",  ext: "mp3" },
	wav:  { label: "WAV",  ext: "wav" },
	flac: { label: "FLAC", ext: "flac" },
};

exports.SUPPORTED_FORMATS = SUPPORTED_FORMATS;
exports.AUDIO_FORMATS = AUDIO_FORMATS;

exports.isValidFormat = format => format in SUPPORTED_FORMATS;
exports.isValidAudioFormat = format => format in AUDIO_FORMATS;

exports.getExt = format => SUPPORTED_FORMATS[format]?.ext ?? "mp4";
exports.getAudioExt = format => AUDIO_FORMATS[format]?.ext ?? "mp3";
