const socket = io();
const KIOSK_CONFIG = window.KIOSK_CONFIG || {};

const $ = (id) => document.getElementById(id);

const els = {
  siteName: $("siteName"),
  power: $("power"),
  powerUnit: $("powerUnit"),
  pred: $("pred"),
  predUnit: $("predUnit"),
  weather: $("weather"),
  weatherIcon: $("weatherIcon"),
  weatherCaption: $("weatherCaption"),
  lastUpdated: $("lastUpdated"),
  connectionStatus: $("connectionStatus"),
  capacityFill: $("capacityFill"),
  capacityPercent: $("capacityPercent"),
  modeLabel: $("modeLabel"),
  gridLine: $("gridLine"),
  gridLabel: $("gridLabel"),
  todayEnergy: $("todayEnergy"),
  todayUnit: $("todayUnit"),
  monthEnergy: $("monthEnergy"),
  monthUnit: $("monthUnit"),
  lifetimeEnergy: $("lifetimeEnergy"),
  lifetimeUnit: $("lifetimeUnit"),
  co2Offset: $("co2Offset"),
  milesAvoided: $("milesAvoided"),
  treesPlanted: $("treesPlanted"),
  devicesCharged: $("devicesCharged")
};

const DEFAULT_SYSTEM_CAPACITY_WATTS = 600000;
const POUNDS_CO2_PER_KWH = 0.855;
const METRIC_TONS_CO2_PER_MILE = 3.93e-4;
const METRIC_TONS_CO2_PER_TREE_SEEDLING = 0.060;
const KWH_PER_SMARTPHONE_CHARGE = 0.019;
const FALLBACK_SITE_NAME = "Pettit National Ice Center";

let configuredSiteName = "";
let configuredSystemCapacityWatts = DEFAULT_SYSTEM_CAPACITY_WATTS;
let history = [];

function parsePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeCapacityToWatts(value) {
  const number = parsePositiveNumber(value);
  if (!number) return null;
  // Values under 1000 are usually entered as kW, e.g. 25.5.
  return number < 1000 ? number * 1000 : number;
}

function readManualSiteName() {
  const params = new URLSearchParams(window.location.search);
  const queryName = String(params.get("siteName") || "").trim();

  if (params.has("clearSiteName")) {
    localStorage.removeItem("kioskSiteName");
  }

  if (queryName) {
    localStorage.setItem("kioskSiteName", queryName);
    return queryName;
  }

  return String(KIOSK_CONFIG.siteName || localStorage.getItem("kioskSiteName") || "").trim();
}

function readManualCapacityWatts() {
  const params = new URLSearchParams(window.location.search);
  const queryWatts = normalizeCapacityToWatts(params.get("capacityWatts"));
  const queryKw = normalizeCapacityToWatts(params.get("capacityKw"));

  if (queryWatts || queryKw) {
    const watts = queryWatts || queryKw;
    localStorage.setItem("kioskSystemCapacityWatts", String(watts));
    return watts;
  }

  return normalizeCapacityToWatts(KIOSK_CONFIG.systemCapacityWatts)
    || normalizeCapacityToWatts(KIOSK_CONFIG.systemCapacityKw)
    || normalizeCapacityToWatts(localStorage.getItem("kioskSystemCapacityWatts"))
    || null;
}

const manualSiteName = readManualSiteName();
const manualCapacityWatts = readManualCapacityWatts();
if (manualCapacityWatts) configuredSystemCapacityWatts = manualCapacityWatts;

function isGenericSiteName(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text
    || text === "solar performance dashboard"
    || text === "solar site"
    || text === FALLBACK_SITE_NAME.toLowerCase();
}

function applySiteName(value) {
  const candidate = String(value || "").trim();
  const siteName = candidate || configuredSiteName || FALLBACK_SITE_NAME;
  configuredSiteName = siteName;
  els.siteName.textContent = siteName;
  document.title = `${siteName} | SolarEdge Dashboard`;
  return siteName;
}

async function loadKioskConfig() {
  if (manualSiteName) {
    applySiteName(manualSiteName);
    return;
  }

  try {
    const response = await fetch("/config", { cache: "no-store" });
    if (!response.ok) throw new Error(`config status ${response.status}`);
    const config = await response.json();

    if (config?.systemCapacityWatts && !manualCapacityWatts) {
      const watts = normalizeCapacityToWatts(config.systemCapacityWatts);
      if (watts) configuredSystemCapacityWatts = watts;
    }

    if (config?.siteName && !isGenericSiteName(config.siteName)) {
      applySiteName(config.siteName);
    } else if (config?.siteId) {
      applySiteName(`SolarEdge Site ${config.siteId}`);
    }
  } catch (error) {
    console.warn("Kiosk config unavailable:", error);
  }
}

applySiteName(manualSiteName || "");
loadKioskConfig();

function setStatus(label, state) {
  els.connectionStatus.classList.remove("online", "offline");
  els.connectionStatus.classList.add(state);
  els.connectionStatus.lastChild.textContent = ` ${label}`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 10000) return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(1);
}

function formatPower(watts) {
  if (!Number.isFinite(watts)) return { value: "--", unit: "W" };
  if (Math.abs(watts) >= 1000) {
    return { value: (watts / 1000).toFixed(1), unit: "kW" };
  }
  return { value: Math.round(watts).toLocaleString(), unit: "W" };
}

function formatEnergy(wh) {
  if (!Number.isFinite(wh)) return { value: "--", unit: "kWh" };
  const kwh = wh / 1000;
  if (kwh >= 1000) {
    return { value: (kwh / 1000).toFixed(2), unit: "MWh" };
  }
  if (kwh >= 100) {
    return { value: Math.round(kwh).toLocaleString(), unit: "kWh" };
  }
  return { value: kwh.toFixed(1), unit: "kWh" };
}

function setEnergy(valueEl, unitEl, wh) {
  const energy = formatEnergy(wh);
  valueEl.textContent = energy.value;
  unitEl.textContent = energy.unit;
}

function getSystemCapacityWatts(solar) {
  const candidates = [
    manualCapacityWatts,
    solar?.systemCapacityWatts,
    solar?.systemCapacity,
    solar?.details?.peakPower,
    solar?.details?.nameplateCapacity,
    solar?.details?.dcCapacity
  ];

  for (const candidate of candidates) {
    const watts = normalizeCapacityToWatts(candidate);
    if (watts) {
      configuredSystemCapacityWatts = watts;
      return watts;
    }
  }

  return configuredSystemCapacityWatts || DEFAULT_SYSTEM_CAPACITY_WATTS;
}

function updateSystemCapacityDisplay(systemCapacityWatts) {
  const capacity = formatPower(systemCapacityWatts);
  els.pred.textContent = capacity.value;
  els.predUnit.textContent = capacity.unit;
}

function getMode(power) {
  if (power > 3000) return "Peak Output";
  if (power > 1000) return "Strong Generation";
  if (power > 250) return "Low Generation";
  return "Standby";
}

function setScene(power) {
  document.body.classList.remove("scene-day", "scene-sunset", "scene-night");
  if (power > 2000) document.body.classList.add("scene-day");
  else if (power > 300) document.body.classList.add("scene-sunset");
  else document.body.classList.add("scene-night");
}

function updateFlow(power) {
  const exporting = power > 500;
  els.gridLine.classList.toggle("import", !exporting);
  els.gridLabel.textContent = exporting ? "Grid Export" : "Grid Import";
}

function getWeatherIcon(condition, iconCode) {
  const main = String(condition || "").toLowerCase();
  const code = String(iconCode || "");

  if (code.startsWith("01")) return code.endsWith("n") ? "☾" : "☀";
  if (main.includes("thunder")) return "⚡";
  if (main.includes("drizzle")) return "☂";
  if (main.includes("rain")) return "☔";
  if (main.includes("snow")) return "❄";
  if (main.includes("cloud")) return "☁";
  if (main.includes("mist") || main.includes("fog") || main.includes("haze") || main.includes("smoke")) return "≋";
  return "☀";
}

function updateWeather(weather) {
  const temp = weather?.main?.temp;
  const condition = weather?.weather?.[0]?.main;
  const description = weather?.weather?.[0]?.description;
  const iconCode = weather?.weather?.[0]?.icon;

  els.weatherIcon.textContent = getWeatherIcon(condition, iconCode);

  if (Number.isFinite(temp) && condition) {
    els.weather.textContent = `${Math.round(temp)}°F`;
    els.weatherCaption.textContent = description
      ? condition + " · " + description.replace(/^./, (char) => char.toUpperCase())
      : condition;
    return;
  }

  els.weather.textContent = "--";
  els.weatherCaption.textContent = "Weather feed unavailable.";
}

function getSiteName(solar) {
  if (manualSiteName) return manualSiteName;
  if (configuredSiteName && !isGenericSiteName(configuredSiteName)) return configuredSiteName;

  const candidate = solar?.siteName
    || solar?.details?.name
    || solar?.details?.publicSettings?.name
    || solar?.details?.location?.address
    || solar?.details?.location?.city
    || (solar?.siteId ? `SolarEdge Site ${solar.siteId}` : "");

  if (!isGenericSiteName(candidate)) return candidate;
  return configuredSiteName || FALLBACK_SITE_NAME;
}

function updateSiteName(solar) {
  applySiteName(getSiteName(solar));
}

function updateEnvironmentalEquivalents(lifetimeKwh) {
  if (!Number.isFinite(lifetimeKwh)) {
    els.co2Offset.textContent = "--";
    els.milesAvoided.textContent = "--";
    els.treesPlanted.textContent = "--";
    els.devicesCharged.textContent = "--";
    return;
  }

  const lifetimeCo2Lbs = lifetimeKwh * POUNDS_CO2_PER_KWH;
  const lifetimeCo2MetricTons = lifetimeCo2Lbs / 2204.62;
  const milesAvoided = lifetimeCo2MetricTons / METRIC_TONS_CO2_PER_MILE;
  const treesPlanted = lifetimeCo2MetricTons / METRIC_TONS_CO2_PER_TREE_SEEDLING;
  const devicesCharged = lifetimeKwh / KWH_PER_SMARTPHONE_CHARGE;

  els.co2Offset.textContent = Math.round(lifetimeCo2Lbs).toLocaleString();
  els.milesAvoided.textContent = formatNumber(milesAvoided);
  els.treesPlanted.textContent = formatNumber(treesPlanted);
  els.devicesCharged.textContent = formatNumber(devicesCharged);
}

function updateSolar(solar) {
  updateSiteName(solar);

  const overview = solar?.overview || {};
  const power = overview?.currentPower?.power;

  if (!Number.isFinite(power)) {
    els.power.textContent = "--";
    els.powerUnit.textContent = "W";
    updateSystemCapacityDisplay(getSystemCapacityWatts(solar));
    els.capacityFill.style.width = "0%";
    els.capacityPercent.textContent = "--";
    els.modeLabel.textContent = "Waiting";
    updateEnvironmentalEquivalents(null);
    return false;
  }

  const current = formatPower(power);
  const systemCapacityWatts = getSystemCapacityWatts(solar);
  const capacity = Math.min(100, Math.max(0, (power / systemCapacityWatts) * 100));

  els.power.textContent = current.value;
  els.powerUnit.textContent = current.unit;
  updateSystemCapacityDisplay(systemCapacityWatts);
  els.capacityFill.style.width = `${capacity}%`;
  els.capacityPercent.textContent = `${Math.round(capacity)}%`;
  els.modeLabel.textContent = getMode(power);

  setEnergy(els.todayEnergy, els.todayUnit, overview?.lastDayData?.energy);
  setEnergy(els.monthEnergy, els.monthUnit, overview?.lastMonthData?.energy);
  setEnergy(els.lifetimeEnergy, els.lifetimeUnit, overview?.lifeTimeData?.energy);

  const lifetimeKwh = Number.isFinite(overview?.lifeTimeData?.energy)
    ? overview.lifeTimeData.energy / 1000
    : null;
  updateEnvironmentalEquivalents(lifetimeKwh);

  setScene(power);
  updateFlow(power);
  scaleGlobe(power);
  return true;
}

function updateTimestamp() {
  els.lastUpdated.textContent = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

/* ===== THREE.JS AMBIENT ORB ===== */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
  canvas: $("globe"),
  alpha: true,
  antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(2.2, 64, 64),
  new THREE.MeshBasicMaterial({
    color: 0xf37021,
    wireframe: true,
    transparent: true,
    opacity: 0.3
  })
);
scene.add(globe);
camera.position.z = 5;

function scaleGlobe(power) {
  const scale = 1 + Math.min(power, configuredSystemCapacityWatts || DEFAULT_SYSTEM_CAPACITY_WATTS) / 16000;
  globe.scale.setScalar(scale);
}

function animateGlobe() {
  requestAnimationFrame(animateGlobe);
  globe.rotation.y += 0.0018;
  globe.rotation.x += 0.00045;
  renderer.render(scene, camera);
}
animateGlobe();

/* ===== PARTICLES ===== */
const canvas = $("particles");
const ctx = canvas.getContext("2d");
let particles = [];

function resizeCanvases() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = width;
  canvas.height = height;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  particles = Array.from({ length: Math.floor(width / 24) }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    speed: Math.random() * 0.65 + 0.15,
    size: Math.random() * 2 + 0.6,
    opacity: Math.random() * 0.45 + 0.1
  }));
}

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach((particle) => {
    particle.y -= particle.speed;
    particle.x += Math.sin(particle.y / 90) * 0.18;
    if (particle.y < -10) particle.y = canvas.height + 10;

    ctx.beginPath();
    ctx.fillStyle = `rgba(243, 112, 33, ${particle.opacity})`;
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  });
  requestAnimationFrame(animateParticles);
}

window.addEventListener("resize", resizeCanvases);
resizeCanvases();
animateParticles();

/* ===== SOCKET EVENTS ===== */
socket.on("connect", () => setStatus("Live", "online"));
socket.on("disconnect", () => setStatus("Offline", "offline"));

socket.on("data", ({ solar, weather, errors } = {}) => {
  const hasSolar = updateSolar(solar);
  updateWeather(weather);
  updateTimestamp();

  if (!hasSolar) {
    setStatus(errors?.solar || "Waiting", "offline");
    return;
  }

  setStatus(errors?.solar ? "Delayed" : "Live", errors?.solar ? "offline" : "online");
});

/* ===== KIOSK DIMMING ===== */
let idleTimer;
function resetIdle() {
  document.body.style.opacity = 1;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    document.body.style.opacity = 0.82;
  }, 300000);
}

window.addEventListener("mousemove", resetIdle);
window.addEventListener("touchstart", resetIdle);
resetIdle();
