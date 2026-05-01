socket.on("data", ({ solar, weather }) => {
  const power = solar.overview.currentPower.power;
  powerEl.textContent = power;
  predEl.textContent = predict(power);
  globe.scale.setScalar(1 + power / 5000);
  setScene(power);
  updateFlow(power);
  if (weather) {
    weatherEl.textContent = `${weather.main.temp}°F ${weather.weather[0].main}`;
  }
});
