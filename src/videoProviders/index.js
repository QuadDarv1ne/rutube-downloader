const videoProviders = [
	require("./aserPro"),
	require("./ok"),
	require("./rutube"),
	require("./vimeo"),
	require("./vk"),
];

exports.selectVideoProvider = function (url) {
	for (let provider of videoProviders) {
		if (provider.mayUse(url)) return provider;
	}

	throw new Error("Не найдено загрузчика для: " + url);
};
