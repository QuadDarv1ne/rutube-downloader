exports.parallelFor = async function (parallelNum, items, fn) {
	if (!items.length || !Number.isFinite(parallelNum) || parallelNum < 1) {
		// Ensure at least 1 parallel task
		parallelNum = 1;
	}

	const itemsLength = items.length;
	let firstError = null;

	// Wrap each task so errors are captured but the race still works
	function runTask(item, index) {
		return fn(item, index).then(
			() => ({ ok: true, index }),
			err => {
				if (!firstError) firstError = err;
				return { ok: false, index, err };
			}
		);
	}

	const parallels = [];
	let index = 0;
	for (let i = 0; i < parallelNum && index < itemsLength; i++) {
		parallels[i] = runTask(items[index], index);
		index++;
	}

	while (index < itemsLength && !firstError) {
		const result = await Promise.race(parallels);
		if (!result.ok) {
			// Error already captured in firstError
			break;
		}
		parallels[result.index] = runTask(items[index], index);
		index++;
	}

	// Wait for all remaining tasks to finish
	await Promise.allSettled(parallels);

	if (firstError) throw firstError;
};
