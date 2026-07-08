const returnValue = v => () => v;

exports.parallelFor = async function (parallelNum, items, fn) {
	if (!items.length || parallelNum < 1) return;

	const parallels = [];
	const itemsLength = items.length;
	let failed = false;

	let index = 0;
	for (let i = 0; i < parallelNum && index < itemsLength; i++) {
		parallels[i] = fn(items[index], index).then(returnValue(i));
		index++;
	}

	try {
		while (index < itemsLength && !failed) {
			const i = await Promise.race(parallels);
			parallels[i] = fn(items[index], index).then(returnValue(i));
			index++;
		}
	} catch (e) {
		failed = true;
	}

	await Promise.allSettled(parallels);

	if (failed) {
		const settled = await Promise.allSettled(parallels);
		const firstError = settled.find(r => r.status === "rejected");
		if (firstError) throw firstError.reason;
	}
};
