exports.parallelFor = async function (parallelNum, items, fn, signal) {
	if (!items.length || !Number.isFinite(parallelNum) || parallelNum < 1) {
		parallelNum = 1;
	}

	const itemsLength = items.length;
	let firstError = null;
	let nextItemIndex = 0;
	let aborted = false;

	if (signal) {
		const onAbort = () => {
			aborted = true;
		};
		signal.addEventListener("abort", onAbort, { once: true });
	}

	function runTask(item, itemIndex, slotIndex) {
		return fn(item, itemIndex).then(
			() => ({ ok: true, slotIndex }),
			err => {
				if (!firstError) firstError = err;
				return { ok: false, slotIndex, err };
			}
		);
	}

	const slots = [];
	const slotCount = Math.min(parallelNum, itemsLength);
	for (let i = 0; i < slotCount; i++) {
		slots[i] = runTask(items[nextItemIndex], nextItemIndex, i);
		nextItemIndex++;
	}

	while (nextItemIndex < itemsLength && !firstError && !aborted) {
		const result = await Promise.race(slots);
		if (!result.ok) {
			break;
		}
		slots[result.slotIndex] = runTask(
			items[nextItemIndex],
			nextItemIndex,
			result.slotIndex
		);
		nextItemIndex++;
	}

	await Promise.allSettled(slots);

	if (firstError) throw firstError;
};
