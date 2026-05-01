require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server);

const API_KEY = process.env.API_KEY;
const SITE_ID = process.env.SITE_ID;
const PORT = process.env.PORT || 3000;

let lastSolar = null;
let lastWeather = null;

function getErrorMessage(error) {
  if (error && error.response && error.response.data) {
    return error.response.data;
  }

  if (error && error.message) {
    return error.message;
  }

  return error;
}

async function fetchSolar() {
  const res = await axios.get(
    "https://monitoringapi.solaredge.com/site/" + SITE_ID + "/overview.json",
    {
      params: {
        api_key: API_KEY
      },
      timeout: 10000
    }
  );

  return res.data;
}

async function fetchWeather() {
  const res = await axios.get(
    "https://api.openweathermap.org/data/2.5/weather",
    {
      params: {
        q: process.env.CITY,
        appid: process.env.WEATHER_KEY,
        units: "imperial"
      },
      timeout: 10000
    }
  );

  return res.data;
}

async function sendData() {
  let solar = lastSolar;
  let weather = lastWeather;

  try {
    solar = await fetchSolar();
    lastSolar = solar;
  } catch (error) {
    console.error("SolarEdge fetch failed:", getErrorMessage(error));
  }

  try {
    weather = await fetchWeather();
    lastWeather = weather;
  } catch (error) {
    console.error("Weather fetch failed:", getErrorMessage(error));
  }

  io.emit("data", {
    solar: solar,
    weather: weather,
    errors: {
      solar: solar ? null : "SolarEdge data unavailable",
      weather: weather ? null : "Weather data unavailable"
    }
  });
}

io.on("connection", function () {
  sendData();
});

setInterval(sendData, 10000);

server.listen(PORT, function () {
  console.log("Running on port " + PORT);
});
