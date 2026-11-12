const PUBLIC_PRICES = "https://public.api.energyzero.nl/public/v1/prices";
const LEGACY_PRICES = "https://api.energyzero.nl/v1/energyprices";

const INTERVALS = {
	quarter: "INTERVAL_QUARTER",
	hour: "INTERVAL_HOUR",
};

function localDateKey(instant, timeZone) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
}

function toApiDate(key) {
	const [year, month, day] = key.split("-");
	return `${day}-${month}-${year}`;
}

function addDays(key, days) {
	const [year, month, day] = key.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function parseBlocks(stream) {
	return (stream || []).map((item) => ({
		start: item.start,
		end: item.end,
		price: Number(item.price.value),
	})).filter((item) => Number.isFinite(item.price));
}

async function getJson(url) {
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": "MagicMirror MMM-EnergyZero",
		},
	});
	if (!response.ok) {
		throw new Error(`EnergyZero antwoordde met ${response.status}`);
	}
	return response.json();
}

async function fetchPublicDay(energyType, dateKey, interval) {
	const params = new URLSearchParams({
		energyType,
		date: toApiDate(dateKey),
		interval,
	});
	const data = await getJson(`${PUBLIC_PRICES}?${params}`);
	return parseBlocks(data.all_in_with_vat);
}

function currentBlock(blocks, now) {
	const time = now.getTime();
	return blocks.find((block) => {
		const start = new Date(block.start).getTime();
		const end = new Date(block.end).getTime();
		return start <= time && time < end;
	}) || null;
}

function blocksOnDay(blocks, dateKey, timeZone) {
	return blocks
		.filter((block) => localDateKey(new Date(block.start), timeZone) === dateKey)
		.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function addFee(blocks, fee) {
	return blocks.map((block) => ({ ...block, price: block.price + fee }));
}

function summarize(blocks) {
	if (!blocks.length) return null;
	const prices = blocks.map((block) => block.price);
	return {
		min: Math.min(...prices),
		max: Math.max(...prices),
		average: prices.reduce((sum, price) => sum + price, 0) / prices.length,
	};
}

function historyStart(now, months, timeZone) {
	const [year, month] = localDateKey(now, timeZone).split("-").map(Number);
	return new Date(Date.UTC(year, month - months, 1)).toISOString();
}

async function fetchDailyAverages(usageType, fromDate, tillDate) {
	const params = new URLSearchParams({
		fromDate,
		tillDate,
		interval: "5",
		usageType: String(usageType),
		inclBtw: "true",
	});
	const data = await getJson(`${LEGACY_PRICES}?${params}`);
	return data.Prices || [];
}

function monthlyAverages(prices, timeZone, months) {
	const buckets = new Map();
	for (const item of prices) {
		const price = Number(item.price);
		if (!Number.isFinite(price) || price <= 0) continue;
		const key = localDateKey(new Date(item.readingDate), timeZone).slice(0, 7);
		const bucket = buckets.get(key) || { sum: 0, count: 0 };
		bucket.sum += price;
		bucket.count += 1;
		buckets.set(key, bucket);
	}

	return [...buckets.keys()].sort().slice(-months).map((key) => {
		const bucket = buckets.get(key);
		const [year, month] = key.split("-").map(Number);
		const label = new Intl.DateTimeFormat("nl-NL", { month: "short", timeZone: "UTC" })
			.format(new Date(Date.UTC(year, month - 1, 1)));
		return {
			key,
			label: label.replace(".", ""),
			price: bucket.sum / bucket.count,
		};
	});
}

async function loadPrices(options = {}) {
	const timeZone = options.timeZone || "Europe/Amsterdam";
	const months = options.months || 6;
	const interval = INTERVALS[options.electricityInterval] || INTERVALS.hour;
	const now = options.now ? new Date(options.now) : new Date();
	const today = localDateKey(now, timeZone);
	const tomorrow = addDays(today, 1);

	const [electricityBlocks, gasBlocks, dailyElectricity] = await Promise.all([
		fetchPublicDay("ENERGY_TYPE_ELECTRICITY", today, interval),
		fetchPublicDay("ENERGY_TYPE_GAS", today, "INTERVAL_DAY"),
		fetchDailyAverages(1, historyStart(now, months, timeZone), now.toISOString()),
	]);

	const electricityFee = Number.isFinite(options.electricityFee) ? options.electricityFee : 0.02;
	const gasFee = Number.isFinite(options.gasFee) ? options.gasFee : 0.08;
	const todayElectricity = addFee(blocksOnDay(electricityBlocks, today, timeZone), electricityFee);
	const tomorrowElectricity = addFee(blocksOnDay(electricityBlocks, tomorrow, timeZone), electricityFee);
	const electricityNow = currentBlock(todayElectricity, now) || currentBlock(addFee(electricityBlocks, electricityFee), now);
	const gasNow = addFee([currentBlock(gasBlocks, now) || gasBlocks.at(-1)].filter(Boolean), gasFee)[0] || null;

	return {
		updated: now.toISOString(),
		timeZone,
		fees: {
			electricity: electricityFee,
			gas: gasFee,
		},
		electricity: {
			unit: "kWh",
			now: electricityNow,
			today: todayElectricity,
			tomorrow: tomorrowElectricity,
			summary: summarize(todayElectricity),
		},
		gas: {
			unit: "m³",
			now: gasNow,
		},
		history: monthlyAverages(dailyElectricity, timeZone, months),
	};
}

module.exports = {
	loadPrices,
	localDateKey,
	monthlyAverages,
};
