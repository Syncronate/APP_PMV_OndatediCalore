const BULLETIN_CSV_URL = "https://raw.githubusercontent.com/ondata/ondate-calore/main/data/ondate-calore_latest.csv";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=43.71&longitude=13.22&current_weather=true";
const CITY = "ANCONA";
const BULLETIN_REFRESH_MS = 60 * 60 * 1000;
const TEMPERATURE_REFRESH_MS = 15 * 60 * 1000;

const RISK_TEXTS = {
  0: "Condizioni meteorologiche non a rischio per la salute della popolazione.",
  1: "Condizioni meteorologiche che possono precedere un livello 2. Pre-Allerta dei servizi sanitari e sociali.",
  2: "Temperature elevate e condizioni meteorologiche che possono avere effetti negativi sulla salute della popolazione, in particolare nei sottogruppi suscettibili. Allerta dei servizi sanitari.",
  3: "Ondata di calore. Condizioni ad elevato rischio che persistono per 3 o più giorni consecutivi. Allerta dei servizi sanitari e sociali."
};

const LEVEL_LABELS = {
  0: "Livello 0",
  1: "Livello 1",
  2: "Livello 2",
  3: "Livello 3"
};

const LEVEL_CLASSES = ["level-0", "level-1", "level-2", "level-3", "level-missing"];
const BORDER_CLASSES = ["level-border-0", "level-border-1", "level-border-2", "level-border-3", "level-border-missing"];

const forecastGrid = document.getElementById("forecast-grid");
const riskFooter = document.getElementById("risk-footer");
const maxRiskLabel = document.getElementById("max-risk-label");
const riskDescription = document.getElementById("risk-description");
const bulletinStatus = document.getElementById("bulletin-status");
const qrCode = document.getElementById("qr-code");
const currentTemperature = document.getElementById("current-temperature");
const temperatureStatus = document.getElementById("temperature-status");

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
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function mapCsvRows(rows) {
  if (rows.length === 0) {
    return [];
  }

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
  if (!match) {
    return "--/--/----";
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function getLevelClass(level) {
  return Number.isInteger(level) && level >= 0 && level <= 3 ? `level-${level}` : "level-missing";
}

function setCardState(card, item) {
  const level = Number.parseInt(item?.level, 10);
  const validLevel = Number.isInteger(level) && level >= 0 && level <= 3;

  card.classList.remove(...LEVEL_CLASSES);
  card.classList.add(getLevelClass(validLevel ? level : null));

  card.querySelector(".forecast-date").textContent = item?.date ? formatDate(item.date) : "--/--/----";
  card.querySelector(".forecast-level").textContent = validLevel ? LEVEL_LABELS[level] : "Dato non disponibile";
}

function setFooterBorder(level) {
  riskFooter.classList.remove(...BORDER_CLASSES);
  riskFooter.classList.add(Number.isInteger(level) ? `level-border-${level}` : "level-border-missing");
}

function renderQrCode(pdfUrl) {
  qrCode.innerHTML = "";

  if (!pdfUrl) {
    const placeholder = document.createElement("div");
    placeholder.className = "qr-placeholder";
    placeholder.textContent = "PDF non disponibile";
    qrCode.appendChild(placeholder);
    return;
  }

  if (typeof QRCode === "undefined") {
    const link = document.createElement("div");
    link.className = "qr-placeholder";
    link.textContent = "QR non disponibile";
    qrCode.appendChild(link);
    return;
  }

  new QRCode(qrCode, {
    text: pdfUrl,
    width: 240,
    height: 240,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}

function renderBulletin(items, statusText) {
  const cards = Array.from(forecastGrid.querySelectorAll(".forecast-card"));
  const visibleItems = items.slice(0, 3);

  cards.forEach((card, index) => {
    setCardState(card, visibleItems[index]);
  });

  const validLevels = visibleItems
    .map((item) => Number.parseInt(item?.level, 10))
    .filter((level) => Number.isInteger(level) && level >= 0 && level <= 3);

  if (validLevels.length === 0) {
    setFooterBorder(null);
    maxRiskLabel.textContent = "Livello massimo: dato non disponibile";
    riskDescription.textContent = "Bollettino temporaneamente non disponibile. Le informazioni saranno aggiornate automaticamente.";
    bulletinStatus.textContent = statusText || "Dati non disponibili";
    renderQrCode("");
    return;
  }

  const maxLevel = Math.max(...validLevels);
  const pdfUrl = visibleItems.find((item) => item?.pdfUrl)?.pdfUrl || "";

  setFooterBorder(maxLevel);
  maxRiskLabel.textContent = `Livello massimo previsto: ${LEVEL_LABELS[maxLevel]}`;
  riskDescription.textContent = RISK_TEXTS[maxLevel];
  bulletinStatus.textContent = statusText;
  renderQrCode(pdfUrl);
}

async function fetchBulletin() {
  try {
    bulletinStatus.textContent = "Aggiornamento bollettino in corso";

    const response = await fetch(`${BULLETIN_CSV_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const csvText = await response.text();
    const rows = mapCsvRows(parseCsv(csvText));
    const anconaRows = rows
      .filter((row) => row.city.trim().toUpperCase() === CITY)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (anconaRows.length === 0) {
      renderBulletin([], "Nessun dato disponibile per Ancona");
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const latestRows = anconaRows
      .filter((row) => {
        const rowDate = new Date(`${row.date}T00:00:00`);
        return Number.isNaN(rowDate.getTime()) || rowDate >= today;
      })
      .slice(0, 3);

    renderBulletin(latestRows.length > 0 ? latestRows : anconaRows.slice(-3), `Ultimo aggiornamento: ${new Date().toLocaleString("it-IT")}`);
  } catch (error) {
    console.error("Errore durante il recupero del bollettino:", error);
    renderBulletin([], "Errore nel recupero del bollettino. Nuovo tentativo automatico previsto.");
  }
}

async function fetchTemperature() {
  try {
    temperatureStatus.textContent = "Aggiornamento";

    const response = await fetch(`${WEATHER_URL}&t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const temperature = data?.current_weather?.temperature;

    if (typeof temperature !== "number") {
      throw new Error("Temperatura non presente nella risposta");
    }

    currentTemperature.textContent = `${Math.round(temperature)}\u00b0C`;
    temperatureStatus.textContent = "Senigallia";
  } catch (error) {
    console.error("Errore durante il recupero della temperatura:", error);
    currentTemperature.textContent = "--\u00b0C";
    temperatureStatus.textContent = "Dato non disponibile";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchBulletin();
  fetchTemperature();

  setInterval(fetchBulletin, BULLETIN_REFRESH_MS);
  setInterval(fetchTemperature, TEMPERATURE_REFRESH_MS);
});
