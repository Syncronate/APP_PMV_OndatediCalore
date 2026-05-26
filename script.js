const BULLETIN_JSON_URL = "bollettino_ancona.json";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=43.71&longitude=13.22&current_weather=true";
const CITY = "ANCONA";
const BULLETIN_REFRESH_MS = 60 * 60 * 1000;
const TEMPERATURE_REFRESH_MS = 15 * 60 * 1000;

const LEVEL_LABELS = {
  0: "NESSUNA ALLERTA",
  1: "ALLERTA LIVELLO 1",
  2: "ALLERTA LIVELLO 2",
  3: "ALLERTA LIVELLO 3"
};

const LEVEL_CLASSES = ["level-0", "level-1", "level-2", "level-3", "level-missing"];

// DOM Elements
const currentDateEl = document.getElementById("current-date");
const currentTimeEl = document.getElementById("current-time");
const currentTempEl = document.getElementById("current-temperature");
const qrCodeEl = document.getElementById("qr-code");

const MONTHS = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
const DAYS = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];

function updateClock() {
  const now = new Date();
  const dayName = DAYS[now.getDay()];
  const day = now.getDate().toString().padStart(2, '0');
  const monthName = MONTHS[now.getMonth()];
  
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  currentDateEl.textContent = `${dayName} ${day} ${monthName}`;
  currentTimeEl.textContent = `${hours}:${minutes}`;
}

// CSV Parsing
function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(value.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }
    value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(header) {
  return header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function mapCsvRows(rows) {
  if (rows.length === 0) return [];

  const header = rows[0].map(normalizeHeader);
  const indexes = {
    city: header.findIndex((name) => name === "citta" || name === "city"),
    date: header.findIndex((name) => name === "data" || name === "date"),
    level: header.findIndex((name) => name === "livello" || name === "level"),
    pdf: header.findIndex((name) => name === "urlpdf" || name === "pdf" || name === "url")
  };

  const fallbackIndexes = {
    city: indexes.city >= 0 ? indexes.city : 0,
    date: indexes.date >= 0 ? indexes.date : 1,
    level: indexes.level >= 0 ? indexes.level : 2,
    pdf: indexes.pdf >= 0 ? indexes.pdf : 4
  };

  return rows.slice(1).map((row) => ({
    city: row[fallbackIndexes.city] || "",
    date: row[fallbackIndexes.date] || "",
    level: row[fallbackIndexes.level] || "",
    pdfUrl: row[fallbackIndexes.pdf] || ""
  }));
}

function formatDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "--/--";
  return `${match[3]}/${match[2]}`; // DD/MM to fit better
}

function getLevelClass(level) {
  return Number.isInteger(level) && level >= 0 && level <= 3 ? `level-${level}` : "level-missing";
}

function parseLevel(rawLevel) {
  const match = String(rawLevel ?? "").match(/[0-3]/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function renderQrCode(pdfUrl) {
  qrCodeEl.innerHTML = "";
  if (!pdfUrl) return;

  if (typeof QRCode !== "undefined") {
    new QRCode(qrCodeEl, {
      text: pdfUrl,
      width: 100,
      height: 100,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

function renderBulletin(items) {
  const visibleItems = items.slice(0, 3);
  let pdfUrl = "";

  for (let i = 0; i < 3; i++) {
    const card = document.getElementById(`card-${i}`);
    const dateEl = document.getElementById(`date-${i}`);
    const statusEl = document.getElementById(`status-${i}`);
    
    if (!card) continue;

    const item = visibleItems[i];
    const level = parseLevel(item?.level);
    const validLevel = Number.isInteger(level) && level >= 0 && level <= 3;

    card.classList.remove(...LEVEL_CLASSES);
    card.classList.add(getLevelClass(validLevel ? level : null));

    dateEl.textContent = item?.date ? formatDate(item.date) : "--/--";
    statusEl.textContent = validLevel ? LEVEL_LABELS[level] : "DATO NON DISPONIBILE";
    
    if (item?.pdfUrl) {
        pdfUrl = item.pdfUrl;
    }
  }

  renderQrCode(pdfUrl);
}

async function fetchBulletin() {
  try {
    const response = await fetch(`${BULLETIN_JSON_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const items = await response.json();

    if (!items || items.length === 0) {
      renderBulletin([]);
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const latestRows = items
      .filter((row) => {
        const rowDate = new Date(`${row.date}T00:00:00`);
        return Number.isNaN(rowDate.getTime()) || rowDate >= today;
      })
      .slice(0, 3);

    renderBulletin(latestRows.length > 0 ? latestRows : items.slice(-3));
  } catch (error) {
    console.error("Errore bollettino:", error);
    renderBulletin([]);
  }
}

async function fetchTemperature() {
  try {
    const response = await fetch(`${WEATHER_URL}&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const temperature = data?.current_weather?.temperature;

    if (typeof temperature !== "number") throw new Error("Temp not found");

    currentTempEl.innerHTML = `${Math.round(temperature)}&deg;C`;

  } catch (error) {
    console.error("Errore temperatura:", error);
    currentTempEl.textContent = "--°C";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);
  
  fetchBulletin();
  fetchTemperature();

  setInterval(fetchBulletin, BULLETIN_REFRESH_MS);
  setInterval(fetchTemperature, TEMPERATURE_REFRESH_MS);
});
