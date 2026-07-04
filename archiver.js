/**
 * Данный скрипт для системы сборки на GitHub
 */
const fs = require("node:fs"),
	path = require("node:path"),
	archiver = require("archiver"),
	delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async function () {

	console.log(" ");
	const output = fs.createWriteStream(path.join(__dirname, "rutube-downloader.zip")),
		archive = archiver("zip", {
			zlib: { level: 9 },
		}),
		files = [
			"README.md",
			"index.js",
			"package.json",
			"LICENSE"
		];

	archive.pipe(output);

	for (const file of files) {
		const streamFile = fs.createReadStream(
			path.normalize(path.join(__dirname, file))
		);
		archive.append(streamFile, { name: file });
		console.log("ADD FILE:", file);
	}
	archive.glob("app/**", { cwd: __dirname });
	archive.glob("bin/**", { cwd: __dirname });
	archive.glob("node_modules/**", { cwd: __dirname });
	archive.glob("src/**", { cwd: __dirname });
	console.log("FINALIZED...");
	archive.finalize();

	await delay(500);
	console.log("DONE!", "rutube-downloader.zip");
	console.log(" ");
})();
