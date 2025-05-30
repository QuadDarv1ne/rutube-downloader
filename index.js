#!/usr/bin/env node

/**
 *
 * Первый параметр при запуске скрипта должен быть url видео
 * Пример:
 * node index.js https://rutube.ru/video/bb2a7557a09fbe3d63f74dd98aef3551/
 * node index.js https://rutube.ru/video/29085a3569472fab6ee8d8af0262758a/
 * node index.js https://rutube.ru/video/ba1f267bcff6a3529889a6dd08bfb764/ https://aser.pro/content/stream/podnyatie_urovnya_v_odinochku/001_29006/hls/index.m3u8 -t 'Поднятие уровня в одиночку серия 01' https://rutube.ru/video/342af3c3cbba19c9a95252fc27bc60a4/ -p 10
 */

const { rl } = require("./src/dialogue");
const { parseArgs } = require("./src/parseArgs");

async function run() {
    const state = parseArgs(process.argv);
    while (state.currentFileIndex < state.files.length) {
        const file = state.files[state.currentFileIndex];
        const cfg = {
            root: state.root,
            video: state.video,
            title: file.title,
            parallelNum: state.parallelSegments,
            url: file.url,
            manualVideoQuality: state.manualVideoQuality,
            quality: state.quality,
        };

        const [name, quality] = await file.videoProvider.loadVideo(cfg);

        file.name = name;
        state.quality = quality;
        state.currentFileIndex++;
    }
    return state;
}

run()
    .then(state => {
        console.clear();
        console.log(`Загружено файлов: ${state.currentFileIndex}`);
        for (let file of state.files) console.log(" +", file.name);
    })
    .finally(() => {
        rl.close();
    });
