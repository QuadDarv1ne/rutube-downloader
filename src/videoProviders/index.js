const videoProviders = [
	require("./youtube"),
	require("./aserPro"),
	require("./ok"),
	require("./rutube"),
	require("./vk"),
	require("./vkLive"),
];

exports.selectVideoProvider = function (url) {
	for (let provider of videoProviders) {
		if (provider.mayUse(url)) return provider;
	}
	return {
		mayUse: () => false,
		loadVideo: function (cfg) {
			throw new Error(require("../i18n").t("error.noLoaderFound") + cfg.url);
		},
	};
};
