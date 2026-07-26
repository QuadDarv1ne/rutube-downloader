const cliProgress = require("cli-progress");
const _colors = require("ansi-colors");
const { configure } = require("./configure");
const { t } = require("./i18n");

exports.getProgress = () =>
	new cliProgress.SingleBar(
		{
			stopOnComplete: true,
			hideCursor: false,
			autopadding: true,
			fps: 5,
			barsize: configure.barSize,
		},
		{
			format: formatBar,
			barCompleteChar: "\u2588",
			barIncompleteChar: "\u2592",
		}
	);

function formatBar(optionsBar, paramsBar, payloadBar) {
	function autopadding(value, length) {
		return (optionsBar.autopaddingChar + value).slice(-length);
	}
	const completeSize = Math.round(paramsBar.progress * optionsBar.barsize);
	const incompleteSize = optionsBar.barsize - completeSize;
	const bar =
		optionsBar.barCompleteString.slice(0, completeSize) +
		optionsBar.barGlue +
		optionsBar.barIncompleteString.slice(0, incompleteSize);
	const percentage = Math.floor(paramsBar.progress * 100) + "";
	const stopTime = Date.now();
	const elapsedTime = stopTime - paramsBar.startTime;

	// Speed calculation
	const totalBytes = payloadBar.totalBytes || 0;
	const speed = totalBytes > 0 && elapsedTime > 0
		? totalBytes / (elapsedTime / 1000)
		: 0;
	const speedStr = formatSpeed(speed);

	// ETA calculation
	const remaining = paramsBar.total - paramsBar.value;
	let etaStr = "--:--";
	if (speed > 0 && remaining > 0) {
		// Estimate average bytes per segment from what we have so far
		const avgBytes = paramsBar.value > 0 ? totalBytes / paramsBar.value : 0;
		const remainingBytes = remaining * avgBytes;
		const etaSec = Math.round(remainingBytes / speed);
		etaStr = formatTime(etaSec * 1000);
	}

	const provider = " " +
		_colors.white("|") +
		" " +
		autopadding(paramsBar.value, `${paramsBar.total}`.length) +
		`/${paramsBar.total}`;

	const payload = payloadBar.filename ? " " +
		_colors.white("|") +
		" " + t("progress.activeFiles") +
		`${payloadBar.filename}` : "";

	const barStr =
		_colors.white("|") +
		_colors.cyan(bar + " " + autopadding(percentage, 3) + "%") +
		" " +
		_colors.white("|") +
		" " +
		_colors.yellowBright(speedStr) +
		" " +
		_colors.white("|") +
		" " +
		_colors.green("ETA " + etaStr) +
		" " +
		_colors.white("|") +
		" " +
		formatTime(elapsedTime) +
		provider +
		payload;
	return barStr;
}

function formatSpeed(bytesPerSec) {
	if (bytesPerSec <= 0) return "  0 B/s";
	if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + " B/s";
	if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + " KB/s";
	return (bytesPerSec / (1024 * 1024)).toFixed(1) + " MB/s";
}

function formatTime(value) {
	let s = String(Math.floor((value / 1000) % 60)).padStart(2, "0");
	let m = String(Math.floor((value / 1000 / 60) % 60)).padStart(2, "0");
	let h = String(Math.floor((value / (1000 * 60 * 60)) % 24)).padStart(2, "0");
	return h + ":" + m + ":" + s;
}
