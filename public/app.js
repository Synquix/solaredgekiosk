socket.on("data", ({ solar, weather, errors }) => {
  const power = solar?.overview?.currentPower?.power;

  if (typeof power !== "number") {
    powerEl.textContent = "--";
    predEl.textContent = "--";
    weatherEl.textContent = errors?.solar || "Waiting for SolarEdge data";
    console.log("Missing or invalid solar payload:", solar);
    return;
  }

  powerEl.textContent = power;
  predEl.textContent = predict(power);
  globe.scale.setScalar(1 + power / 5000);
  setScene(power);
  updateFlow(power);

  if (weather?.main?.temp && weather?.weather?.[0]?.main) {
    weatherEl.textContent = `${weather.main.temp}°F ${weather.weather[0].main}`;
  } else {
    weatherEl.textContent = "Weather unavailable";
  }
});
