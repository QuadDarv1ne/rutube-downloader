const videoProviders = [
	require("./youtube"),
	require("./aserPro"),
	require("./ok"),
	require("./rutube"),
	require("./vk"),
];

exports.selectVideoProvider = function (url) {
	for (let provider of videoProviders) {
		if (provider.mayUse(url)) return provider;
	}
	return {
		mayUse: () => false,
		loadVideo: function (cfg) {
			throw new Error("Не найден загрузчик для: " + cfg.url);
		},
	};
};
