require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const SITE_ID = process.env.SITE_ID;
const WEATHER_KEY = process.env.WEATHER_KEY;
const CITY = process.env.CITY || '';
const SITE_NAME_ENV =
  process.env.SITE_NAME ||
  process.env.KIOSK_SITE_NAME ||
  process.env.DISPLAY_SITE_NAME ||
  '';
const SYSTEM_CAPACITY_WATTS_ENV = process.env.SYSTEM_CAPACITY_WATTS || '';
const SYSTEM_CAPACITY_KW_ENV = process.env.SYSTEM_CAPACITY_KW || '';

let lastSolar = null;
let lastWeather = null;
let lastDetails = null;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeCapacityToWatts(value) {
  const number = parsePositiveNumber(value);
  if (!number) return null;
  return number < 1000 ? number * 1000 : number;
}

function getErrorMessage(error) {
  if (error?.response?.data) {
    return typeof error.response.data === 'string'
      ? error.response.data
      : JSON.stringify(error.response.data);
  }
  return error?.message || String(error);
}

function getBestSiteName(details = lastDetails) {
  return clean(SITE_NAME_ENV)
    || clean(details?.name)
    || clean(details?.publicSettings?.name)
    || clean(details?.location?.address)
    || clean(details?.location?.city)
    || (SITE_ID ? `SolarEdge Site ${SITE_ID}` : 'Solar Site');
}

function getSystemCapacityWatts(details = lastDetails) {
  return normalizeCapacityToWatts(SYSTEM_CAPACITY_WATTS_ENV)
    || normalizeCapacityToWatts(SYSTEM_CAPACITY_KW_ENV)
    || normalizeCapacityToWatts(details?.peakPower)
    || normalizeCapacityToWatts(details?.nameplateCapacity)
    || normalizeCapacityToWatts(details?.dcCapacity)
    || null;
}

function getSiteIdentity(details = lastDetails) {
  return {
    siteId: SITE_ID || null,
    siteName: getBestSiteName(details),
    city: CITY || details?.location?.city || null,
    systemCapacityWatts: getSystemCapacityWatts(details),
    source: clean(SITE_NAME_ENV)
      ? 'env'
      : details?.name
        ? 'solaredge-details'
        : SITE_ID
          ? 'site-id'
          : 'fallback'
  };
}

function requireSolarConfig() {
  if (!API_KEY || !SITE_ID) {
    throw new Error('Missing API_KEY or SITE_ID in environment variables.');
  }
}

async function fetchSolarOverview() {
  requireSolarConfig();

  const response = await axios.get(
    `https://monitoringapi.solaredge.com/site/${SITE_ID}/overview.json`,
    {
      params: { api_key: API_KEY },
      timeout: 10000
    }
  );

  return response.data;
}

async function fetchSiteDetails() {
  requireSolarConfig();

  const response = await axios.get(
    `https://monitoringapi.solaredge.com/site/${SITE_ID}/details.json`,
    {
      params: { api_key: API_KEY },
      timeout: 10000
    }
  );

  return response.data?.details || null;
}

async function fetchSolar() {
  const [overviewResult, detailsResult] = await Promise.allSettled([
    fetchSolarOverview(),
    fetchSiteDetails()
  ]);

  if (detailsResult.status === 'fulfilled' && detailsResult.value) {
    lastDetails = detailsResult.value;
  } else if (detailsResult.status === 'rejected') {
    console.warn('SolarEdge details fetch failed:', getErrorMessage(detailsResult.reason));
  }

  const siteIdentity = getSiteIdentity(lastDetails);

  if (overviewResult.status === 'rejected') {
    throw new Error(getErrorMessage(overviewResult.reason));
  }

  return {
    ...overviewResult.value,
    ...siteIdentity,
    details: lastDetails
  };
}

async function fetchWeather() {
  if (!WEATHER_KEY || !CITY) return null;

  const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
    params: {
      q: CITY,
      appid: WEATHER_KEY,
      units: 'imperial'
    },
    timeout: 10000
  });

  return response.data;
}

app.get('/config', (req, res) => {
  res.json(getSiteIdentity(lastDetails));
});

async function broadcastData() {
  const errors = {};
  let solar = lastSolar || getSiteIdentity(lastDetails);
  let weather = lastWeather;

  const [solarResult, weatherResult] = await Promise.allSettled([
    fetchSolar(),
    fetchWeather()
  ]);

  if (solarResult.status === 'fulfilled') {
    solar = solarResult.value;
    lastSolar = solar;
  } else {
    errors.solar = solarResult.reason?.message || 'Solar feed delayed';
    solar = {
      ...(lastSolar || {}),
      ...getSiteIdentity(lastDetails)
    };
  }

  if (weatherResult.status === 'fulfilled') {
    weather = weatherResult.value;
    lastWeather = weather;
  } else {
    errors.weather = weatherResult.reason?.message || 'Weather feed delayed';
  }

  io.emit('data', {
    solar,
    weather,
    errors
  });
}

io.on('connection', (socket) => {
  socket.emit('data', {
    solar: lastSolar || getSiteIdentity(lastDetails),
    weather: lastWeather,
    errors: {}
  });
});

broadcastData();
setInterval(broadcastData, 60000);

server.listen(PORT, () => {
  console.log(`SolarEdge kiosk listening on port ${PORT}`);
  console.log(`Kiosk site name: ${getBestSiteName()}`);
});
