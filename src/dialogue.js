const readline = require("readline");

module.exports = {
    rl: readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    }),

    selectVideoQuality: (cfg, playlists) => {
        const widthList = [];
        const qualitiesOptions = playlists.map(({ attributes }, index) => {
            const { width, height } = attributes.RESOLUTION;
            widthList.push(width);
            return `${index} : ${width}x${height} ${attributes.CODECS}`;
        });

        if (!cfg.manualVideoQuality)
            return [playlists[findMaxIndex(widthList)]["uri"], {}];

        if (cfg.quality) {
            const selectedIndex = qualitiesOptions.indexOf(cfg.quality.label);
            if (selectedIndex === cfg.quality.index)
                return [playlists[selectedIndex]["uri"], cfg.quality];
        }

        console.log("Выберите качество для видео: " + cfg.title);
        for (let item of qualitiesOptions) console.log(item);

        return new Promise(resolve =>
            module.exports.rl.question("", answer => {
                const index = Number.parseInt(answer);
                console.log("Выбран вариант:", qualitiesOptions[index]);
                resolve([
                    playlists[index]["uri"],
                    { index, label: qualitiesOptions[index] },
                ]);
            })
        );
    },
};

function findMaxIndex(arr) {
    let max = arr[0],
        maxIndex = 0;

    for (let i = 1, l = arr.length; i < l; i++) {
        const el = arr[i];
        if (el > max) {
            max = el;
            maxIndex = i;
        }
    }

    return maxIndex;
}
