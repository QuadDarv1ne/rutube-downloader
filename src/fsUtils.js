const fs = require("node:fs");
const path = require("node:path");

module.exports = {
	createDir: dir =>
		new Promise((resolve, reject) => {
			fs.access(dir, function (err) {
				if (err && err.code === "ENOENT") {
					try {
						fs.mkdirSync(dir, { recursive: true });
						resolve(true);
					} catch (e) {
						reject(e);
					}
				} else if (err) {
					reject(err);
				} else {
					resolve(true);
				}
			});
		}),

	deleteFiles: (reg, dir) =>
		new Promise((resolve, reject) => {
			try {
				const normalizedDir = path.normalize(dir);
				fs.readdirSync(normalizedDir)
					.filter(f => reg.exec(f))
					.forEach(f => {
						fs.unlinkSync(path.join(normalizedDir, f));
					});
				resolve(true);
			} catch (e) {
				reject(e);
			}
		}),

	deleteFile: file =>
		new Promise((resolve, reject) => {
			fs.stat(file, function (err) {
				if (err === null) {
					fs.unlinkSync(file);
					resolve(true);
				} else if (err.code === "ENOENT") {
					resolve(true);
				} else {
					reject(err);
				}
			});
		}),
};
