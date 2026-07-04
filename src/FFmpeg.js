const { exec } = require("node:child_process");

let ffmpegPath;

const probePath = p =>
	new Promise(resolve => {
		exec(`"${p}" -version`, err => {
			resolve(!err);
		});
	});

exports.execFFmpeg = async (input, output) => {
	if (!ffmpegPath) {
		ffmpegPath = "ffmpeg";
		if (!(await probePath(ffmpegPath))) {
			ffmpegPath = "../bin/ffmpeg";

			if (!(await probePath(ffmpegPath))) throw new Error("ffmpeg не найден");
		}
	}

	return new Promise((resolve, reject) => {
		const child = exec(
			`"${ffmpegPath}" -hide_banner -y -i "${input}" -vcodec copy -acodec copy "${output}"`
		);
		let stderr = "";
		child.stderr.on("data", chunk => { stderr += chunk; });
		child.on("exit", code => {
			if (code) reject(new Error("ffmpeg error (code " + code + "): " + stderr.trim()));
			else resolve(true);
		});
	});
};
