const returnValue = v => () => v;

exports.parallelFor = async function (parallelNum, items, fn) {
	if (!items.length || parallelNum < 1) return;

	const parallels = [];
	const itemsLength = items.length;

	let index = 0;
	for (let i = 0; i < parallelNum && index < itemsLength; i++) {
		parallels[i] = fn(items[index], index).then(returnValue(i));
		index++;
	}

	try {
		while (index < itemsLength) {
			const i = await Promise.race(parallels);
			parallels[i] = fn(items[index], index).then(returnValue(i));
			index++;
		}
	} finally {
		await Promise.allSettled(parallels);
	}

	return Promise.all(parallels);
};
