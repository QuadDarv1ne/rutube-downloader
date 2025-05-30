const path = require("node:path");
const { selectVideoProvider } = require("./videoProviders");

exports.parseArgs = args => {
    const root = path.dirname(args[1]);
    const state = {
        root,
        video: path.join(root, "/video"),
        currentFileIndex: 0,
        files: [],
        parallelSegments: 5,
        manualVideoQuality: false,
    };

    if (args.length < 3) {
        showHelp();
        process.exit(0);
    }

    for (let i = 2, l = args.length; i < l; i++) {
        const argument = args[i];
        if (argument.startsWith("-")) {
            tryMatchOption(state, argument, args[i + 1]);
            i++;
        } else {
            state.files.push({
                url: argument,
                videoProvider: selectVideoProvider(argument),
            });
        }
    }

    return state;
};

const help = [
    " ",
    "Использовать: node index.js url1 [url2] [url3 -t custom_title] [url4] [...] [-p 10] [-q]",
    " ",
    "Опции:",
    " -t <title> \t задать имя файла для предыдущего url",
    " -p <int> \t количество одновременных загрузок, по умолчанию 5",
    " -q \t\t скрипт будет спрашивать о том, какого качества видео загружать, по умолчанию выбирает наилучшее",
    " -h \t\t отобразить справку",
    " ",
    "Примеры использования:",
    "+ загрузить видео с rutube, имя файла будет взято как у видео по ссылке",
    "node index.js https://rutube.ru/video/ba1f267bcff6a3529889a6dd08bfb764/",
    " ",
    "+ загрузить видео с aser.pro, имя файла будет взято из аргумента",
    "node index.js https://aser.pro/content/stream/podnyatie_urovnya_v_odinochku/001_29006/hls/index.m3u8 -t 'Поднятие уровня в одиночку серия 01'",
    " ",
    "+ загрузить несколько файлов",
    "node index.js https://rutube.ru/video/ba1f267bcff6a3529889a6dd08bfb764/" +
        " https://aser.pro/content/stream/podnyatie_urovnya_v_odinochku/001_29006/hls/index.m3u8 -t 'Поднятие уровня в одиночку серия 01'" +
        " https://vkvideo.ru/video-18255722_456244249",
    " ",
];

function showHelp() {
    for (let msg of help) console.log(msg);
}

function tryMatchOption(state, option, value) {
    switch (option) {
        case "-t":
            const file = state.files[state.files.length - 1];
            if (!file)
                throw new Error(
                    "Опция -t, может быть использована только после url"
                );
            return (file.title = value);

        case "-p":
            state.parallelSegments = Number.parseInt(value);
            if (
                !Number.isFinite(state.parallelSegments) ||
                state.parallelSegments < 1
            )
                throw new Error(
                    "Количество одновременных загрузок должно быть числом больше 0"
                );
            return;

        case "-q":
            return (state.manualVideoQuality = true);

        case "-h":
            showHelp();
            return process.exit(0);

        default:
            throw new Error("Введена неизвестная опция: " + option);
    }
}
