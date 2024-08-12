/**
 * @typedef {Object} TimeSnappingConfiguration
 * @property {any} timeScale d3 time scale
 * @property {number} numTicks number of snapping points (uses timeScale.ticks to generate snapping points)
 * @property {number} extentStartMs extent start in ms since epoch
 * @property {number} extentEndMs extent end in ms since epoch
 * @property {number} brushStartMs brush start in ms since epoch
 * @property {number} brushEndMs brush end in ms since epoch
 * @property {number} width pixel width of the chart
 * @property {boolean} allowExtentSnapping allow snapping on the extent, even if snapping intervals would not align to extent
 *
 * 
 * @typedef {Function} TimeSnappingFunction
 * @function
 * @param {any} event d3 brush event
 * @param {TimeSnappingResult} previousTimeSnapping previousTimeSnapping
 * @return {TimeSnappingResult} timeSnappingResult
 *
 * @callback selectionChangeCallback
 * @param {any} event d3 brush event
 * @param {TimeSnappingResult} timeSnappingResult snapped result
 * 
 * @typedef {Object} TimeSnappingResult
 * @property {number[]} values values at snap positions
 * @property {number[]} pixels brush start/end pixels
 */


/**
 * Generates a snapping function
 * @param {*} x 
 * @param {*} snappingThreshold 
 * @param {*} rangeStart 
 * @param {*} rangeEnd 
 * @param {*} nonZeroIntervalRequired 
 * @returns 
 */
export function generateLinearSnappingFunction(scale, snappingThreshold, rangeStart, rangeEnd, nonZeroIntervalRequired = true) {
	return (pixelSelection) => {
		const selection = pixelSelection.map(scale.invert);
		const snappedSelection = selection.map((d) => Math.round(Math.round(d / snappingThreshold) * snappingThreshold));
		// non-zero interval check
		if (nonZeroIntervalRequired && snappedSelection[0] === snappedSelection[1]) {
			if (snappedSelection[1] != rangeEnd) {
				snappedSelection[1] += snappingThreshold;
			} else if (snappedSelection[0] != rangeStart) {
				snappedSelection[0] -= snappingThreshold;
			}
		}
		return { values: snappedSelection, pixels: snappedSelection.map(scale) };
	}
}

/**
 * Add linear snapping to a d3 brush
 * @param {*} brush
 * @param {*} brushContainer 
 * @param {*} scale 
 * @param {*} snappingThreshold 
 * @param {*} rangeStart 
 * @param {*} rangeEnd 
 * @param {*} nonZeroIntervalRequired 
 */
export function addLinearSnappingToBrush(brush, brushContainer, scale, snappingThreshold, rangeStart, rangeEnd, nonZeroIntervalRequired = true) {
	const startListener = brush.on("start");
	const brushListener = brush.on("brush");
	const endListener = brush.on("end");

	// generate the snapping function
	const snappingFunction = window.d3BrushSnapping.generateLinearSnappingFunction(scale, snappingThreshold, rangeStart, rangeEnd, nonZeroIntervalRequired);

	function brushed(event) {
		if (brushListener) {
			brushListener(event);
		}
		if (!event.sourceEvent) return;
		brushContainer.call(brush.move, snappingFunction(event.selection).pixels);
	};

	function brushEnd(event) {
		if (endListener) {
			endListener(event);
		}
		if (!event.sourceEvent) return;
		brushContainer.call(brush.move, snappingFunction(event.selection).pixels);
	};

	function brushStart(event) {
		if (startListener) {
			startListener(event);
		}
		if (!event.sourceEvent) return;
		brushContainer.call(brush.move, snappingFunction(event.selection).pixels);
	};

	// update brush listeners to include the modifications necessary for the tooltip
	brush.on("start", brushStart)
		.on("brush", brushed)
		.on("end", brushEnd);
}


/**
 * Performs a binary search on the array looking for the nearest value to the target
 * @param {Array} arr 
 * @param {*} target 
 * @param {Number} lo 
 * @param {Number} hi 
 * @returns the index of the nearest value
 */
const binarySearch = (arr, target, lo = 0, hi = arr.length - 1) => {
	if (target < arr[lo]) {
		return 0;
	}
	if (target > arr[hi]) {
		return hi;
	}
	
	const mid = Math.floor((hi + lo) / 2);
 
	return hi - lo < 2 
	  ? (target - arr[lo]) < (arr[hi] - target) ? lo : hi
	  : target < arr[mid]
		? binarySearch(arr, target, lo, mid)
		: target > arr[mid] 
		  ? binarySearch(arr, target, mid, hi)
		  : mid;
};

/**
 * Generates a function that handles snapping a brush based on a provided configuration
 * @param {TimeSnappingConfiguration} snapConfiguration 
 * @returns {TimeSnappingFunction} time snapping function
 */
const generateTimeSnappingFunction = (snapConfiguration) => {
	const {
		timeScale,
		numTicks,
		extentStartMs,
		extentEndMs,
		brushEndMs,
		allowExtentSnapping,
		width,
	} = snapConfiguration;
	const defaultSnapValues = timeScale.ticks(numTicks).map(value => value.getTime());
	const defaultSnapPixels = defaultSnapValues.map(timeScale);
	const lastIdx = defaultSnapValues.length - 1;
	const timeBetweenTicks = defaultSnapValues.length == 2 ? defaultSnapValues[1] - defaultSnapValues[0] : defaultSnapValues[2] - defaultSnapValues[1];

	const snapOffsetFromStart = Math.abs(defaultSnapValues[0] - extentStartMs);
	const snapValuesFromStart = defaultSnapValues.map(value => value - snapOffsetFromStart);
	const snapPixelsFromStart = snapValuesFromStart.map(timeScale);

	const snapOffsetFromEnd = Math.abs(extentEndMs - defaultSnapValues[lastIdx]);
	const snapValuesFromEnd = defaultSnapValues.map(value => value + snapOffsetFromEnd);
	const snapPixelsFromEnd = snapValuesFromEnd.map(timeScale);

	// track the initial pixel, this is for the case where a user starts brushing from a new position, rather than dragging an end
	let initialPixel = null;

	return (event, previousSelection) => {
		const { selection, mode, type } = event;
		if (mode === "drag") {
			const previousDurationInMs = Math.abs(previousSelection.values[1] - previousSelection.values[0]);
			if (selection[0] === previousSelection.pixels[0] && selection[1] === previousSelection.pixels[1]) {
				return previousSelection
			}
			let snappingPixels = defaultSnapPixels;
			let snappingValues = defaultSnapValues;
			if (allowExtentSnapping && selection[0] === 0) {
				snappingPixels = snapPixelsFromStart;
				snappingValues = snapValuesFromStart;
			} else if (allowExtentSnapping && selection[1] === width) {
				snappingPixels = snapPixelsFromEnd;
				snappingValues = snapValuesFromEnd;
			}
		
			const lowIdx = binarySearch(snappingPixels, selection[0]);
			const highIdx = binarySearch(snappingPixels, selection[1]);
		
			const snappedValues = [snappingValues[lowIdx], snappingValues[highIdx]];
			const snappedPixels = [snappingPixels[lowIdx], snappingPixels[highIdx]];
			if (snappedValues[1] > brushEndMs) { // if dragging forward, correct the rear
				snappedValues[0] = snappedValues[1] - previousDurationInMs;
				snappedPixels[0] = timeScale(snappedValues[0]);
			} else {
				snappedValues[1] = snappedValues[0] + previousDurationInMs;
				snappedPixels[1] = timeScale(snappedValues[1]);
			}
		
			return { values: snappedValues, pixels: snappedPixels };
		} else {
			// starting a new brush
			if (type === "start" && selection[0] === selection[1]) {
				initialPixel = selection[0];
			}

			// handle case where entire timeline range is selected
			if (selection[0] === 0 && selection[1] === width) {
				return { values: [extentStartMs, extentEndMs], pixels: [0, width] };
			}

			// don't snap on start event that hasn't changed
			if (type === "start" && selection[0] === previousSelection.pixels[0] && selection[1] === previousSelection.pixels[1]) {
				return { values: previousSelection.values, pixels: previousSelection.pixels};
			}

			// determine which handle should be locked in place
			const lockWest = selection[0] === previousSelection.pixels[0] || (selection[0] === previousSelection.pixels[1] && selection[1] !== previousSelection.pixels[1]);
			const lockEast = selection[1] === previousSelection.pixels[1] || (selection[1] === previousSelection.pixels[0] && selection[0] !== previousSelection.pixels[0]);

			// determine which snapping array to use
			let snappingPixels = defaultSnapPixels;
			let snappingValues = defaultSnapValues;
			if (allowExtentSnapping && selection[0] < (defaultSnapPixels[0] - snapPixelsFromStart[0]) / 2) {
				snappingPixels = snapPixelsFromStart;
				snappingValues = snapValuesFromStart;
			} else if (allowExtentSnapping && selection[1] > (width - ((width - defaultSnapPixels[lastIdx]) / 2))) {
				snappingPixels = snapPixelsFromEnd;
				snappingValues = snapValuesFromEnd;
			}

			// get the snapped dates/pixels
			let lowIdx = binarySearch(snappingPixels, selection[0]);
			let highIdx = binarySearch(snappingPixels, selection[1]);
			let snappedValues = [snappingValues[lowIdx], snappingValues[highIdx]];
			let snappedPixels = [snappingPixels[lowIdx], snappingPixels[highIdx]];

			// lock one side to the previous selection and determine the snapping location of the unlocked side
			if ((lockWest || lockEast) && !initialPixel) {
				const lockIdx = lockWest ? 0 : 1;
				const unlockedIdx = lockWest ? 1 : 0;
				let currentIdx = lockWest ? highIdx + 1 : lowIdx - 1;
				const moveIdx = lockWest ? idx => idx + 1 : idx => idx - 1;
				if (selection[lockIdx] === previousSelection.pixels[lockIdx]) {
					snappedPixels[lockIdx] = previousSelection.pixels[lockIdx];
					snappedValues[lockIdx] = previousSelection.values[lockIdx];
				} else {
					snappedPixels[lockIdx] = previousSelection.pixels[unlockedIdx];
					snappedValues[lockIdx] = previousSelection.values[unlockedIdx];
				}
				while (snappedValues[1] - snappedValues[0] < timeBetweenTicks && currentIdx != lastIdx) {
					snappedValues[unlockedIdx] = snappingValues[currentIdx];
					snappedPixels[unlockedIdx] = snappingPixels[currentIdx];
					currentIdx = moveIdx(currentIdx);
				}
				// handle case where we have matching indices and need to move one side to the previous/next snapping point
			} else if (lowIdx === highIdx && type != "start" && initialPixel) {
				if (selection[0] === initialPixel) { // dragging left brush forward
					snappedValues = [snappingValues[lowIdx], snappingValues[Math.min(lastIdx, highIdx + 1)]];
					snappedPixels = [snappingPixels[lowIdx], snappingPixels[Math.min(lastIdx, highIdx + 1)]];
				} else { // dragging right brush backward
					snappedValues = [snappingValues[Math.max(0, lowIdx - 1)], snappingValues[highIdx]];
					snappedPixels = [snappingPixels[Math.max(0, lowIdx - 1)], snappingPixels[highIdx]];		
				}
			}

			if (type === "end") {
				initialPixel = null;
			}

			return { values: snappedValues, pixels: snappedPixels };
		}
	}
};

/**
 * Add linear snapping to a d3 brush
 * @param {*} brush
 * @param {*} brushContainer 
 * @param {TimeSnappingConfiguration} configuration
 * @param {selectionChangeCallback} onSelectionChange
 */
export function addTimeSnappingToBrush(brush, brushContainer, configuration, onSelectionChange) {
	const startListener = brush.on("start");
	const brushListener = brush.on("brush");
	const endListener = brush.on("end");

	const datesToPixels = (dates) => dates.map(configuration.timeScale);

	const previousTimeSnapping = {
		pixels: datesToPixels([new Date(configuration.brushStartMs), new Date(configuration.brushEndMs)]),
		values: [configuration.brushStartMs, configuration.brushEndMs],
	};

	// generate the snapping function
	const selectionSnappingFunction = generateTimeSnappingFunction(configuration);

	function handleEvent(event) {
		if (!event.sourceEvent) return;
		if (!event.selection) {
			brushContainer.call(brush.move, previousTimeSnapping.pixels);
		} else {
			const timeSnappingResult = selectionSnappingFunction(event, previousTimeSnapping);
			if (event.type === "end") {
				previousTimeSnapping.pixels = timeSnappingResult.pixels;
				previousTimeSnapping.values = timeSnappingResult.values;
			}
			brushContainer.call(brush.move, timeSnappingResult.pixels);
			if (onSelectionChange) {
				onSelectionChange(event, timeSnappingResult);
			}
		}
	}

	function brushed(event) {
		if (brushListener) {
			brushListener(event);
		}
		handleEvent(event);
	};

	function brushEnd(event) {
		if (endListener) {
			endListener(event);
		}
		handleEvent(event);
	};

	function brushStart(event) {
		if (startListener) {
			startListener(event);
		}
		handleEvent(event);
	};

	// update brush listeners to include the modifications necessary for the tooltip
	brush.on("start", brushStart)
		.on("brush", brushed)
		.on("end", brushEnd);
}