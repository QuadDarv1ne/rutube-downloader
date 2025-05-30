const videoProviders = [
    require("./aserPro"),
    require("./rutube"),
    require("./vk"),
];

exports.selectVideoProvider = function (url) {
    for (let provider of videoProviders) {
        if (provider.mayUse(url)) return provider;
    }

    throw new Error("Не найдено загрузчика для: " + url);
};
