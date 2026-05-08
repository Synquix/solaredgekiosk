// Kiosk display overrides. This file is loaded in the browser before app.js.
// Use this when the SolarEdge site name is not the exact display name you want.
// This wins over SolarEdge API data and server-side .env values.
window.KIOSK_CONFIG = {
  // Put the exact kiosk title here, for example: "ABC Manufacturing Solar Array".
  // Leave blank to use SITE_NAME from .env or SolarEdge data.
  siteName: "Pettit National Ice Center",

  // Put the true system size here. You can use either watts or kilowatts.
  // systemCapacityWatts wins when both are set.
  systemCapacityWatts: null,
  systemCapacityKw: null
};
