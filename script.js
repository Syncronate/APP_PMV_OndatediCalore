const BULLETIN_CSV_URL = "https://raw.githubusercontent.com/ondata/ondate-calore/main/data/ondate-calore_latest.csv";
const WEATHER_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQRYZz5cm8M6XWpz9aFh62Pw-2q-7pIpViKFV_Zv4qlJMWYTQwg2zMW9L1U_s3QfPdrQtNPvmD8cBUx/pub?gid=377471478&single=true&output=csv";
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

// DOM Elements (evaluated later since elements might be absent)
const getEl = (id) => document.getElementById(id);

const MONTHS = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
const DAYS = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];

function updateClock() {
  const currentDateEl = getEl("current-date");
  const currentTimeEl = getEl("current-time");

  const now = new Date();
  const dayName = DAYS[now.getDay()];
  const day = now.getDate().toString().padStart(2, '0');
  const monthName = MONTHS[now.getMonth()];
  
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  if (currentDateEl) {
    currentDateEl.textContent = `${dayName} ${day} ${monthName}`;
  }
  if (currentTimeEl) {
    currentTimeEl.textContent = `${hours}:${minutes}`;
  }
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
  const qrCodeEl = getEl("qr-code");
  if (!qrCodeEl) return;

  qrCodeEl.innerHTML = "";
  if (!pdfUrl) return;

  if (typeof QRCode !== "undefined") {
    new QRCode(qrCodeEl, {
      text: pdfUrl,
      width: 256,
      height: 256,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

function renderBulletin(items) {
  const visibleItems = items.slice(0, 3);
  let pdfUrl = "";

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  for (let i = 0; i < 3; i++) {
    const card = document.getElementById(`card-${i}`);
    const dateEl = document.getElementById(`date-${i}`);
    const statusEl = document.getElementById(`status-${i}`);
    
    if (!card) continue;

    const item = visibleItems[i];
    const level = parseLevel(item?.level);
    const validLevel = Number.isInteger(level) && level >= 0 && level <= 3;

    card.classList.remove(...LEVEL_CLASSES);
    card.classList.remove("is-today", "is-past");
    card.classList.add(getLevelClass(validLevel ? level : null));

    if (item?.date) {
      console.log(`Confronto date - Card ID: ${card.id}, JSON Date: "${item.date}", Local Today: "${todayStr}"`);

      if (item.date === todayStr) {
        console.log(`-> MATCH! Aggiungo is-today a ${card.id}`);
        card.classList.add("is-today");
      } else if (item.date < todayStr) {
        card.classList.add("is-past");
      }
    }

    const dateFormatted = item?.date ? formatDate(item.date) : "--/--";
    const badgeContainer = document.getElementById(`badge-${i}`);
    
    if (badgeContainer) {
      if (item?.date && item.date === todayStr) {
        badgeContainer.innerHTML = `<span class="today-badge">OGGI</span>`;
      } else {
        badgeContainer.innerHTML = "";
      }
      dateEl.textContent = dateFormatted;
    } else {
      if (item?.date && item.date === todayStr) {
        dateEl.innerHTML = `<span class="today-badge">OGGI</span>${dateFormatted}`;
      } else {
        dateEl.textContent = dateFormatted;
      }
    }
    
    statusEl.textContent = validLevel ? LEVEL_LABELS[level] : "DATO NON DISPONIBILE";
    
    if (item?.pdfUrl) {
        pdfUrl = item.pdfUrl;
    }
  }

  renderQrCode(pdfUrl);
}

async function fetchBulletin() {
  try {
    const response = await fetch(`${BULLETIN_CSV_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const csvText = await response.text();
    const rows = parseCsv(csvText);
    const items = mapCsvRows(rows);

    // Filtra solo la città configurata
    const cityItems = items.filter(item => item.city.toUpperCase() === CITY.toUpperCase());

    if (!cityItems || cityItems.length === 0) {
      renderBulletin([]);
      return;
    }

    // Ordina per data crescente e prendi le ultime 3 previsioni
    cityItems.sort((a, b) => a.date.localeCompare(b.date));
    renderBulletin(cityItems.slice(-3));
  } catch (error) {
    console.error("Errore bollettino:", error);
    renderBulletin([]);
  }
}

async function fetchTemperature() {
  try {
    const response = await fetch(`${WEATHER_URL}&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const csvText = await response.text();
    const rows = parseCsv(csvText);

    if (rows.length < 2) throw new Error("No data rows found in CSV");

    // The header is the first row. We find the index of "Sant'Angelo - Temperatura Aria (°C)"
    const headerRow = rows[0];
    const tempIndex = headerRow.findIndex(h => h.includes("Sant'Angelo - Temperatura Aria"));

    if (tempIndex === -1) throw new Error("Temperature column not found in CSV");

    // Get the last row of data
    const lastRow = rows[rows.length - 1];
    let tempStr = lastRow[tempIndex];

    if (!tempStr || tempStr === "N/A") throw new Error("Temperature data is missing in the last row");

    // Remove quotes and replace comma with dot
    tempStr = tempStr.replace(/"/g, '').replace(',', '.');
    const temperature = parseFloat(tempStr);

    if (isNaN(temperature)) throw new Error("Parsed temperature is not a number");

    const currentTempEl = getEl("current-temperature");
    if (currentTempEl) {
      currentTempEl.innerHTML = `${Math.round(temperature)}&deg;C`;
    }

  } catch (error) {
    console.error("Errore temperatura:", error);
    const currentTempEl = getEl("current-temperature");
    if (currentTempEl) {
      currentTempEl.textContent = "--°C";
    }
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
