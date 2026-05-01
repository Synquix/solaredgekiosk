const socket = io();

const powerEl = document.getElementById("power");
const predEl = document.getElementById("pred");
const weatherEl = document.getElementById("weather");

let history = [];

/* ===== THREE.JS GLOBE ===== */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("globe"), alpha: true });

renderer.setSize(window.innerWidth, window.innerHeight);

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(2, 48, 48),
  new THREE.MeshBasicMaterial({ color: 0x00ffc6, wireframe: true })
);

scene.add(globe);
camera.position.z = 5;

function animateGlobe() {
  requestAnimationFrame(animateGlobe);
  globe.rotation.y += 0.002;
  renderer.render(scene, camera);
}
animateGlobe();

/* ===== PARTICLES ===== */
const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particles = Array.from({ length: 60 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  speed: Math.random() + 0.2
}));

function animateParticles() {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.fillStyle = "#00ffc6";

  particles.forEach(p => {
    p.y -= p.speed;
    if (p.y < 0) p.y = canvas.height;
    ctx.fillRect(p.x, p.y, 2, 2);
  });

  requestAnimationFrame(animateParticles);
}
animateParticles();

/* ===== LOGIC ===== */

function predict(power) {
  history.push(power);
  if (history.length > 20) history.shift();

  let trend = history[history.length - 1] - history[0];
  return Math.max(0, Math.floor(power + trend));
}

function setScene(power) {
  if (power > 2000) document.body.className = "scene-day";
  else if (power > 300) document.body.className = "scene-sunset";
  else document.body.className = "scene-night";
}

function updateFlow(power) {
  const exporting = power > 500;

  const line = document.getElementById("line2");
  line.style.stroke = exporting ? "#00ffc6" : "#ff4444";
  line.style.animationDirection = exporting ? "normal" : "reverse";
}

/* ===== SOCKET ===== */
socket.on("data", ({ solar, weather }) => {
  const power = solar.overview.currentPower.power;

  powerEl.textContent = power;
  predEl.textContent = predict(power);

  globe.scale.setScalar(1 + power / 5000);

  setScene(power);
  updateFlow(power);

  if (weather) {
    weatherEl.textContent =
      `${weather.main.temp}°F ${weather.weather[0].main}`;
  }
});

/* ===== AMBIENT MODE ===== */
let idleTimer;

function resetIdle() {
  document.body.style.opacity = 1;
  clearTimeout(idleTimer);

  idleTimer = setTimeout(() => {
    document.body.style.opacity = 0.3;
  }, 300000);
}

window.addEventListener("mousemove", resetIdle);
resetIdle();
