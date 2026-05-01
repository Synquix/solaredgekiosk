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

async function fetchSolar() {
  const res = await axios.get(
    `https://monitoringapi.solaredge.com/site/${SITE_ID}/overview`,
    { params: { api_key: API_KEY } }
  );
  return res.data;
}

async function fetchWeather() {
  const res = await axios.get(
    `https://api.openweathermap.org/data/2.5/weather`,
    {
      params: {
        q: process.env.CITY,
        appid: process.env.WEATHER_KEY,
        units: "imperial"
      }
    }
  );
  return res.data;
}

let lastSolar = null;

setInterval(async () => {
  try {
    const solar = await fetchSolar();
    const weather = await fetchWeather();

    lastSolar = solar;

    io.emit("data", { solar, weather });
  } catch (e) {
    if (lastSolar) {
      io.emit("data", { solar: lastSolar });
    }
  }
}, 10000);

server.listen(process.env.PORT, () =>
  console.log("Running on port " + process.env.PORT)
);
