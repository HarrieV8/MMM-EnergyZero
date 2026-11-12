Module.register("MMM-EnergyZero", {
	defaults: {
		updateInterval: 15 * 60 * 1000,
		electricityInterval: "hour",
		months: 6,
		timeZone: "Europe/Amsterdam",
		electricityFee: 0.02,
		gasFee: 0.08,
	},

	start() {
		this.loaded = false;
		this.error = null;
		this.dataSet = null;
		this.sendSocketNotification("ENERGYZERO_CONFIG", this.config);
	},

	getStyles() {
		return ["MMM-EnergyZero.css"];
	},

	socketNotificationReceived(notification, payload) {
		if (notification === "ENERGYZERO_DATA") {
			this.loaded = true;
			this.error = null;
			this.dataSet = payload;
			this.updateDom(500);
		}
		if (notification === "ENERGYZERO_ERROR") {
			this.error = payload.message;
			this.updateDom(500);
		}
	},

	getDom() {
		const wrapper = document.createElement("div");
		wrapper.className = "energyzero";

		if (this.error && !this.dataSet) {
			wrapper.innerHTML = `<div class="dimmed small">${this.error}</div>`;
			return wrapper;
		}
		if (!this.dataSet) {
			wrapper.innerHTML = `<div class="dimmed small">Energieprijzen laden…</div>`;
			return wrapper;
		}

		const electricity = this.dataSet.electricity;
		const gas = this.dataSet.gas;
		wrapper.append(this.headerRow(electricity, gas));
		wrapper.append(this.feeNote());
		if (electricity.today.length) wrapper.append(this.barChart(electricity.today, electricity.now, "ct"));
		if (this.dataSet.history.length) wrapper.append(this.historyChart(this.dataSet.history));
		return wrapper;
	},

	feeNote() {
		const note = document.createElement("div");
		note.className = "xsmall dimmed";
		const fees = this.dataSet.fees || {};
		const electricity = this.formatPrice(fees.electricity || 0, "ct/kWh");
		const gas = this.formatPrice(fees.gas || 0, "€/m³");
		note.textContent = `incl. Zonneplan-inkoopvergoeding ${electricity} ct en € ${gas}`;
		return note;
	},

	headerRow(electricity, gas) {
		const row = document.createElement("div");
		row.className = "energyzero-now";
		row.append(this.priceBlock("Stroom", electricity.now && electricity.now.price, "ct/kWh", electricity.summary));
		row.append(this.priceBlock("Gas", gas.now && gas.now.price, "€/m³"));
		return row;
	},

	priceBlock(title, price, unit, summary) {
		const block = document.createElement("div");
		block.className = "energyzero-price";
		const value = price == null ? "–" : this.formatPrice(price, unit);
		block.innerHTML = `<div class="small dimmed">${title}</div><div class="bright large">${value}</div><div class="xsmall dimmed">${unit}</div>`;
		if (summary) {
			const range = document.createElement("div");
			range.className = "xsmall dimmed";
			range.textContent = `${this.formatPrice(summary.min, unit)} – ${this.formatPrice(summary.max, unit)}`;
			block.append(range);
		}
		return block;
	},

	barChart(blocks, current, unit) {
		const chart = document.createElement("div");
		chart.className = "energyzero-bars";
		const max = Math.max(...blocks.map((block) => block.price));
		for (const block of blocks) {
			const bar = document.createElement("div");
			bar.className = "energyzero-bar";
			if (current && block.start === current.start) bar.classList.add("current");
			bar.style.height = `${Math.max(8, (block.price / max) * 100)}%`;
			bar.title = `${this.hourLabel(block.start)} ${this.formatPrice(block.price, unit)}`;
			chart.append(bar);
		}
		return chart;
	},

	historyChart(months) {
		const wrap = document.createElement("div");
		wrap.className = "energyzero-history";
		const caption = document.createElement("div");
		caption.className = "xsmall dimmed";
		caption.textContent = "6 mnd markt, incl. btw";
		wrap.append(caption);

		const chart = document.createElement("div");
		chart.className = "energyzero-months";
		const max = Math.max(...months.map((month) => month.price));
		for (const month of months) {
			const column = document.createElement("div");
			column.className = "energyzero-month";
			const bar = document.createElement("div");
			bar.className = "energyzero-month-bar";
			bar.style.height = `${Math.max(8, (month.price / max) * 100)}%`;
			const label = document.createElement("div");
			label.className = "xsmall dimmed";
			label.textContent = month.label;
			column.append(bar, label);
			column.title = `${month.label} ${this.formatPrice(month.price, "ct/kWh")}`;
			chart.append(column);
		}
		wrap.append(chart);
		return wrap;
	},

	formatPrice(price, unit) {
		if (unit.startsWith("ct")) {
			return new Intl.NumberFormat("nl-NL", {
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			}).format(price * 100);
		}
		return new Intl.NumberFormat("nl-NL", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(price);
	},

	hourLabel(iso) {
		return new Intl.DateTimeFormat("nl-NL", {
			timeZone: this.config.timeZone,
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(iso));
	},
});
