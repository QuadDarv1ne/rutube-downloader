exports.vimeoPlaylist = function (playlist) {
	return playlist.map((item, index, array) => ({
		'attributes': {
			'RESOLUTION': {
				'width': item.width,
				'height': item.height
			},
			'CODECS': item.mime,
			'FRAME-RATE': item.fps,
			'BANDWIDTH': 0,
			'PROGRAM-ID': 1
		},
		'uri': item.url,
		'timeline': 0
	}));
};