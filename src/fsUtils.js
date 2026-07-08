const fsp = require("node:fs/promises");
const path = require("node:path");

module.exports = {
	createDir: dir => fsp.mkdir(dir, { recursive: true }),

	deleteFiles: async (reg, dir) => {
		const normalizedDir = path.normalize(dir);
		const entries = await fsp.readdir(normalizedDir);
		await Promise.all(
			entries
				.filter(f => reg.test(f))
				.map(f => fsp.unlink(path.join(normalizedDir, f)).catch(() => {}))
		);
	},

	deleteFile: async file => {
		try {
			await fsp.unlink(file);
			return true;
		} catch (err) {
			if (err.code === "ENOENT") return true;
			throw err;
		}
	},
};
