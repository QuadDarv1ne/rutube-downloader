/**
 * Данный скрипт для системы сборки на GitHub
 */
const fs = require("node:fs"),
	path = require("node:path"),
	archiver = require("archiver");

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

	output.on("error", err => {
		console.error("Output error:", err.message);
		process.exit(1);
	});

	archive.on("error", err => {
		console.error("Archive error:", err.message);
		process.exit(1);
	});

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

	await new Promise((resolve, reject) => {
		output.on("close", resolve);
		archive.on("error", reject);
	});

	console.log("DONE!", "rutube-downloader.zip");
	console.log(" ");
})();
