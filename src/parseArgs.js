const path = require("node:path");
const { configure } = require("./configure");
const { selectVideoProvider } = require("./videoProviders");
const { isValidFormat, isValidAudioFormat } = require("./formats");
const _colors = require("ansi-colors");
const { t, setLocale, getAvailableLocales } = require("./i18n");

exports.parseArgs = args => {
	// First pass: check for -l flag before other processing
	for (let i = 2, l = args.length; i < l; i++) {
		if (args[i] === "-l" && args[i + 1]) {
			setLocale(args[i + 1]);
			break;
		}
	}

	const root = path.dirname(args[1]);
	const state = {
		root,
		video: path.join(root, configure.videoDir),
		currentFileIndex: 0,
		files: [],
		parallelSegments: 5,
		manualVideoQuality: false,
		quality: null,
		format: "mp4",
		audioFormat: null,
		outputDir: null,
	};

	if (args.length < 3) {
		showHelp();
		process.exit(0);
	}

	for (let i = 2, l = args.length; i < l; i++) {
		const argument = args[i];
		if (argument.startsWith("-")) {
			try {
				const consumed = tryMatchOption(state, argument, args[i + 1]);
				if (consumed) i++;
			} catch (e) {
				console.log(_colors.redBright(e.message));
			}
		} else {
			try {
				state.files.push({
					url: argument,
					videoProvider: selectVideoProvider(argument),
				});
			} catch (e) {
				console.log(_colors.redBright(e.message));
			}
		}
	}

	return state;
};

function buildHelp() {
	return [
		" ",
		t("cli.help.usage"),
		_colors.yellowBright(
			"node index.js url1 [url2] [url3 -t custom_title] [url4] [...] [-p 10] [-q] [-f mp4] [-a mp3]"
		),
		"",
		t("cli.help.options"),
		" " +
			_colors.yellowBright("-t <title>") +
			" \t " + t("cli.help.setTitle"),
		" " +
			_colors.yellowBright("-p <int>") +
			" \t " + t("cli.help.parallel"),
		" " +
			_colors.yellowBright("-f <format>") +
			" \t " + t("cli.help.format"),
		" " +
			_colors.yellowBright("-a <format>") +
			" \t " + t("cli.help.audio"),
		" " +
			_colors.yellowBright("-o <dir>") +
			" \t " + t("cli.help.outputDir"),
		" " +
			_colors.yellowBright("-l <locale>") +
			" \t " + t("cli.help.locale"),
		" " +
			_colors.yellowBright("-q") +
			" \t\t " + t("cli.help.quality"),
		" " + _colors.yellowBright("-h") + " \t\t " + t("cli.help.help"),
		" ",
		t("cli.help.examples"),
		"",
		" + " + t("cli.help.exampleRutube"),
		_colors.yellowBright(
			"node index.js https://rutube.ru/video/ba1f267bcff6a3529889a6dd08bfb764/"
		),
		"",
		" + " + t("cli.help.exampleVk"),
		_colors.yellowBright(
			"node index.js https://vkvideo.ru/video-18255722_456244249"
		),
		"",
		" + " + t("cli.help.exampleAser"),
		_colors.yellowBright(
			'node index.js https://aser.pro/content/stream/podnyatie_urovnya_v_odinochku/001_29006/hls/index.m3u8 -t "Поднятие уровня в одиночку серия 01"'
		),
		"",
		" + " + t("cli.help.exampleMultiple"),
		_colors.yellowBright(
			'node index.js https://rutube.ru/video/ba1f267bcff6a3529889a6dd08bfb764/ -t "Отмеченный богом"' +
				' https://aser.pro/content/stream/podnyatie_urovnya_v_odinochku/001_29006/hls/index.m3u8 -t "Поднятие уровня в одиночку серия 01"' +
				' https://vkvideo.ru/video-18255722_456244249 -t "Скачено с VK"'
		),
		"",
		" + " + t("cli.help.exampleMultipleNoArgs"),
		_colors.yellowBright(
			"node index.js https://rutube.ru/video/ba1f267bcff6a3529889a6dd08bfb764/" +
				" https://aser.pro/content/stream/podnyatie_urovnya_v_odinochku/001_29006/hls/index.m3u8" +
				" https://vkvideo.ru/video-18255722_456244249"
		),
		"",
		" + " + t("cli.help.exampleAudioMp3"),
		_colors.yellowBright(
			"node index.js https://rutube.ru/video/ba1f267bcff6a3529889a6dd08bfb764/ -a mp3"
		),
		"",
		" + " + t("cli.help.exampleAudioFlac"),
		_colors.yellowBright(
			"node index.js https://rutube.ru/video/ba1f267bcff6a3529889a6dd08bfb764/ -a flac"
		),
		"",
		" + " + t("cli.help.outputDir"),
		_colors.yellowBright(
			"node index.js https://rutube.ru/video/ba1f267bcff6a3529889a6dd08bfb764/ -o D:\Downloads"
		),
		"",
	];
}

function showHelp() {
	for (let msg of buildHelp()) console.log(msg);
}

function tryMatchOption(state, option, value) {
	switch (option) {
		case "-t": {
			const file = state.files[state.files.length - 1];
			if (!file)
				throw new Error(
					t("cli.error.optionAfterUrl")
				);
			file.title = value;
			return true;
		}

		case "-p": {
			const val = Number.parseInt(value);
			if (!Number.isFinite(val) || val < 1)
				throw new Error(
					t("cli.error.invalidParallelCount")
				);
			state.parallelSegments = val;
			return true;
		}

		case "-q":
			state.manualVideoQuality = true;
			return false;

		case "-f": {
			const fmt = value?.toLowerCase();
			if (!fmt || !isValidFormat(fmt))
				throw new Error(
					t("cli.error.unsupportedFormatCli")
				);
			state.format = fmt;
			return true;
		}

		case "-a": {
			const afmt = value?.toLowerCase();
			if (!afmt || !isValidAudioFormat(afmt))
				throw new Error(
					t("cli.error.unsupportedAudioFormatCli")
				);
			state.audioFormat = afmt;
			return true;
		}

		case "-l": {
			const locale = value?.toLowerCase();
			if (!locale || !getAvailableLocales().includes(locale))
				throw new Error(
					t("cli.error.invalidLocale")
				);
			setLocale(locale);
			return true;
		}

		case "-h":
			showHelp();
			return process.exit(0);

		case "--version":
			const pkg = require("../package.json");
			console.log(pkg.name + " v" + pkg.version);
			return process.exit(0);

		case "-o": {
			const dir = value?.trim();
			if (!dir)
				throw new Error(
					t("cli.error.outputDirRequired")
				);
			state.outputDir = dir;
			return true;
		}

		default:
			throw new Error(t("cli.error.unknownOption") + option);
	}
}
