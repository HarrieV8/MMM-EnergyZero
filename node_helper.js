const NodeHelper = require("node_helper");
const Log = require("logger");
const { loadPrices } = require("./energyzero");

module.exports = NodeHelper.create({
	start() {
		this.config = null;
		this.timer = null;
	},

	socketNotificationReceived(notification, payload) {
		if (notification !== "ENERGYZERO_CONFIG") return;
		this.config = payload;
		this.schedule();
		this.refresh();
	},

	schedule() {
		clearInterval(this.timer);
		const interval = this.config.updateInterval || 15 * 60 * 1000;
		this.timer = setInterval(() => this.refresh(), interval);
	},

	async refresh() {
		try {
			const data = await loadPrices(this.config);
			this.sendSocketNotification("ENERGYZERO_DATA", data);
		} catch (error) {
			Log.error(`[MMM-EnergyZero] ${error.message}`);
			this.sendSocketNotification("ENERGYZERO_ERROR", { message: error.message });
		}
	},
});
