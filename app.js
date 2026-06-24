const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const fileInput = document.querySelector("#fileInput");
const video = document.querySelector("#sourceVideo");
const emptyState = document.querySelector("#emptyState");
const presetGrid = document.querySelector("#presetGrid");
const playPause = document.querySelector("#playPause");
const seek = document.querySelector("#seek");
const timeLabel = document.querySelector("#timeLabel");
const downloadImage = document.querySelector("#downloadImage");
const recordVideo = document.querySelector("#recordVideo");
const statusText = document.querySelector("#statusText");

const presets = {
  heiseiCompact: {
    fade: 24, warmth: 18, contrast: 10, grain: 28, softness: 18,
    vignette: 34, lightLeak: 20, dateStamp: 55, dateText: "1998 06 23",
    dust: true, scanlines: false, chromatic: true,
  },
  showaFilm: {
    fade: 42, warmth: 32, contrast: 22, grain: 48, softness: 24,
    vignette: 46, lightLeak: 28, dateStamp: 0, dateText: "",
    dust: true, scanlines: false, chromatic: false,
  },
  toyCamera: {
    fade: 18, warmth: 26, contrast: 38, grain: 36, softness: 30,
    vignette: 74, lightLeak: 42, dateStamp: 18, dateText: "2002 08 17",
    dust: true, scanlines: false, chromatic: true,
  },
  instant: {
    fade: 50, warmth: 12, contrast: -4, grain: 22, softness: 20,
    vignette: 24, lightLeak: 18, dateStamp: 0, dateText: "",
    dust: false, scanlines: false, chromatic: false,
  },
  vhs: {
    fade: 26, warmth: -10, contrast: 16, grain: 44, softness: 34,
    vignette: 18, lightLeak: 0, dateStamp: 46, dateText: "1994 11 03",
    dust: false, scanlines: true, chromatic: true,
  },
};

let sourceImage = null;
let sourceKind = null;
let animationId = 0;
let recording = false;
let selectedPreset = "heiseiCompact";
let lastDownloadUrl = "";

function readSettings() {
  const preset = presets[selectedPreset] || presets.heiseiCompact;
  return {
    ...preset,
    fade: preset.fade / 100,
    warmth: preset.warmth / 100,
    contrast: preset.contrast / 100,
    grain: preset.grain / 100,
    softness: preset.softness / 100,
    vignette: preset.vignette / 100,
    lightLeak: preset.lightLeak / 100,
    dateStamp: preset.dateStamp / 100,
    dateText: preset.dateStamp > 0 ? formatCurrentStamp() : "",
  };
}

function fitCanvas(width, height) {
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
}

function drawSource() {
  if (sourceKind === "image" && sourceImage) {
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  } else if (sourceKind === "video" && video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function applyPixelPass(settings) {
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const contrast = 1 + settings.contrast;
  const fade = settings.fade;
  const warmth = settings.warmth;
  const grainAmount = settings.grain * 46;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    const grain = (Math.random() - 0.5) * grainAmount;

    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    r = r * (1 - fade * 0.18) + luma * fade * 0.18 + 18 * fade;
    g = g * (1 - fade * 0.12) + luma * fade * 0.12 + 12 * fade;
    b = b * (1 - fade * 0.28) + luma * fade * 0.28 + 8 * fade;

    r += warmth * 26 + grain;
    g += warmth * 8 + grain;
    b -= warmth * 20 - grain;

    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }
  ctx.putImageData(image, 0, 0);
}

function applyChromatic(settings) {
  if (!settings.chromatic) return;
  const offset = Math.max(1, Math.round(2 + settings.softness * 4));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.16;
  ctx.filter = "sepia(1) saturate(1.8) hue-rotate(-24deg)";
  ctx.drawImage(canvas, offset, 0);
  ctx.filter = "sepia(1) saturate(1.8) hue-rotate(150deg)";
  ctx.drawImage(canvas, -offset, 0);
  ctx.restore();
}

function applyOverlays(settings) {
  const w = canvas.width;
  const h = canvas.height;
  const time = sourceKind === "video" ? video.currentTime : 0;

  if (settings.softness > 0) {
    ctx.save();
    ctx.globalAlpha = settings.softness * 0.24;
    ctx.filter = `blur(${1 + settings.softness * 4}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }

  if (settings.lightLeak > 0) {
    const leak = ctx.createRadialGradient(w * 0.05, h * 0.18, 0, w * 0.05, h * 0.18, w * 0.7);
    leak.addColorStop(0, `rgba(255, 116, 54, ${settings.lightLeak * 0.55})`);
    leak.addColorStop(0.38, `rgba(255, 210, 95, ${settings.lightLeak * 0.18})`);
    leak.addColorStop(1, "rgba(255, 210, 95, 0)");
    ctx.fillStyle = leak;
    ctx.fillRect(0, 0, w, h);
  }

  if (settings.vignette > 0) {
    const radius = Math.max(w, h) * 0.72;
    const vignette = ctx.createRadialGradient(w / 2, h / 2, radius * 0.18, w / 2, h / 2, radius);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, `rgba(0, 0, 0, ${settings.vignette * 0.78})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  if (settings.scanlines) {
    ctx.fillStyle = "rgba(20, 20, 20, 0.18)";
    for (let y = Math.floor(time * 18) % 4; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    const tearY = (Math.sin(time * 2.1) * 0.5 + 0.5) * h;
    ctx.fillRect(0, tearY, w, 2);
  }

  if (settings.dust) {
    drawDust(w, h, time);
  }

  if (settings.dateStamp > 0 && settings.dateText) {
    drawDateStamp(settings);
  }
}

function drawDust(w, h, time) {
  const count = Math.round((w * h) / 70000);
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = "#f8ecd6";
  for (let i = 0; i < count; i++) {
    const x = seededNoise(i * 19 + Math.floor(time * 2)) * w;
    const y = seededNoise(i * 31 + 7) * h;
    const size = 0.6 + seededNoise(i * 43) * 1.8;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#fff3df";
  for (let i = 0; i < 5; i++) {
    const x = seededNoise(i * 11 + 5) * w;
    const y = seededNoise(i * 17 + Math.floor(time)) * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8 + seededNoise(i) * 22, y + 14 + seededNoise(i + 3) * 36);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDateStamp(settings) {
  const size = Math.max(18, Math.round(canvas.width * 0.032));
  const x = canvas.width - size * 0.8;
  const y = canvas.height - size * 0.9;
  ctx.save();
  ctx.globalAlpha = settings.dateStamp;
  ctx.font = `700 ${size}px "Courier New", monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(255, 92, 20, 0.8)";
  ctx.shadowBlur = size * 0.18;
  ctx.fillStyle = "#ff7a2d";
  ctx.fillText(settings.dateText, x, y);
  ctx.restore();
}

function renderFrame() {
  const settings = readSettings();
  drawSource();
  applyPixelPass(settings);
  applyChromatic(settings);
  applyOverlays(settings);
  updateTransport();
}

function loop() {
  renderFrame();
  animationId = requestAnimationFrame(loop);
}

function stopLoop() {
  cancelAnimationFrame(animationId);
}

function setPreset(name) {
  if (!presets[name]) return;
  selectedPreset = name;
  document.querySelectorAll(".preset-card").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === name);
  });
  renderFrame();
}

function handleFile(file) {
  URL.revokeObjectURL(video.src);
  stopLoop();
  sourceImage = null;
  video.pause();

  const url = URL.createObjectURL(file);
  if (file.type.startsWith("image/")) {
    const img = new Image();
    img.onload = () => {
      sourceKind = "image";
      sourceImage = img;
      fitCanvas(img.naturalWidth, img.naturalHeight);
      emptyState.hidden = true;
      downloadImage.disabled = false;
      recordVideo.disabled = true;
      playPause.disabled = true;
      seek.disabled = true;
      setStatus("画像を読み込みました");
      renderFrame();
    };
    img.src = url;
    return;
  }

  if (file.type.startsWith("video/")) {
    video.onloadedmetadata = () => {
      sourceKind = "video";
      fitCanvas(video.videoWidth, video.videoHeight);
      emptyState.hidden = true;
      downloadImage.disabled = true;
      recordVideo.disabled = false;
      playPause.disabled = false;
      seek.disabled = false;
      setStatus("動画を読み込みました");
      renderFrame();
      loop();
    };
    video.src = url;
    video.load();
  }
}

function updateTransport() {
  if (sourceKind !== "video" || !Number.isFinite(video.duration)) {
    timeLabel.textContent = "00:00 / 00:00";
    return;
  }
  if (!seek.matches(":active")) {
    seek.value = String((video.currentTime / video.duration) * 1000 || 0);
  }
  timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  playPause.textContent = video.paused ? "再生" : "一時停止";
}

async function downloadCanvas() {
  if (sourceKind !== "image") return;
  renderFrame();
  try {
    const blob = await canvasToBlob("image/png");
    const fileName = `analog-camera-${Date.now()}.png`;
    const url = saveBlob(blob, fileName);
    setDownloadStatus("画像を書き出しました", url, fileName);
  } catch (error) {
    console.error(error);
    setStatus("画像を書き出せませんでした", true);
  }
}

async function recordProcessedVideo() {
  if (recording || sourceKind !== "video") return;
  recording = true;
  recordVideo.textContent = "保存中";
  recordVideo.disabled = true;
  setStatus("動画を書き出しています");

  try {
    const chunks = [];
    const stream = canvas.captureStream(30);
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        const fileName = `analog-camera-${Date.now()}.webm`;
        const url = saveBlob(blob, fileName);
        setDownloadStatus("動画を書き出しました", url, fileName);
      } catch (error) {
        console.error(error);
        setStatus("動画を書き出せませんでした", true);
      }
      recording = false;
      recordVideo.textContent = "動画保存";
      recordVideo.disabled = false;
    };

    video.currentTime = 0;
    await video.play();
    recorder.start(1000);
    const watcher = setInterval(() => {
      if (video.ended || video.paused) {
        clearInterval(watcher);
        recorder.stop();
      }
    }, 250);
  } catch (error) {
    console.error(error);
    setStatus("動画を書き出せませんでした", true);
    recording = false;
    recordVideo.textContent = "動画保存";
    recordVideo.disabled = false;
  }
}

function canvasToBlob(type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas export returned no data."));
    }, type);
  });
}

function saveBlob(blob, fileName) {
  if (lastDownloadUrl) URL.revokeObjectURL(lastDownloadUrl);
  const url = URL.createObjectURL(blob);
  lastDownloadUrl = url;
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  return url;
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("is-error", isError);
}

function setDownloadStatus(message, url, fileName) {
  statusText.classList.remove("is-error");
  statusText.replaceChildren(document.createTextNode(`${message} / `));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.textContent = "保存リンク";
  statusText.append(link);
}

function formatCurrentStamp() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year} ${month} ${day} ${hours}:${minutes}`;
}

function pickMimeType() {
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function seededNoise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) handleFile(file);
});

presetGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-preset]");
  if (button) setPreset(button.dataset.preset);
});

playPause.addEventListener("click", async () => {
  if (video.paused) await video.play();
  else video.pause();
  updateTransport();
});

seek.addEventListener("input", () => {
  if (sourceKind === "video" && Number.isFinite(video.duration)) {
    video.currentTime = (Number(seek.value) / 1000) * video.duration;
    renderFrame();
  }
});

downloadImage.addEventListener("click", downloadCanvas);
recordVideo.addEventListener("click", recordProcessedVideo);
video.addEventListener("ended", updateTransport);
setPreset("heiseiCompact");
