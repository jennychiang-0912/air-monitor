let port = null;
let reader = null;
let inputDone = null;
let keepReading = false;

const MAX_POINTS = 20;
const STORAGE_KEY = "air_monitor_history_csv";

let rawCsv = "time,mq7,dust,co2,tvoc\n";
let chart = null;
let lastMinute = null;

let connectBtn = null;
let statusEl = null;
let timeValueEl = null;

let mq7ValueEl = null;
let dustValueEl = null;
let co2ValueEl = null;
let tvocValueEl = null;

let rawDataEl = null;

let chartTitleEl = null;
let chartSelector = null;

let downloadCsvBtn = null;
let downloadStatusEl = null;

let startTimeEl = null;
let endTimeEl = null;
let queryBtn = null;
let clearBtn = null;
let historyOutputEl = null;

const chartStore = {
  mq7: { labels: [], values: [] },
  dust: { labels: [], values: [] },
  co2: { labels: [], values: [] },
  tvoc: { labels: [], values: [] }
};

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function updateHeaderTime() {
  if (!timeValueEl) return;

  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");

  timeValueEl.textContent = `${y}/${mo}/${d} ${h}:${mi}:${s}`;
}

function formatTimeForCsv(date = new Date()) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${mo}/${d} ${h}:${mi}`;
}

function normalizeArduinoTimeToMinute(timeStr) {
  if (!timeStr) return "";

  const clean = String(timeStr).trim();

  // 支援：
  // YYYY/MM/DD HH:MM
  // YYYY/MM/DD HH:MM:SS
  let m = clean.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return clean;

  const [, y, mo, d, h, mi] = m;
  return `${y}/${mo}/${d} ${h}:${mi}`;
}

function extractMinuteLabel(timeStr) {
  if (!timeStr) return "";

  const clean = String(timeStr).trim();
  const m = clean.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return clean;

  return `${m[4]}:${m[5]}`;
}

function parseTimeToTimestamp(timeStr) {
  if (!timeStr) return NaN;

  const clean = String(timeStr).trim();
  const m = clean.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return NaN;

  const [, y, mo, d, h, mi] = m;

  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    0
  ).getTime();
}

function parseHourToTimestamp(hourStr, endOfHour = false) {
  if (!hourStr) return NaN;

  const clean = String(hourStr).trim();
  const m = clean.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2})$/);
  if (!m) return NaN;

  const [, y, mo, d, h] = m;

  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    endOfHour ? 59 : 0,
    endOfHour ? 59 : 0
  ).getTime();
}

function toNumberOrNull(value) {
  if (value == null) return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function clearAllChartData() {
  chartStore.mq7.labels = [];
  chartStore.mq7.values = [];

  chartStore.dust.labels = [];
  chartStore.dust.values = [];

  chartStore.co2.labels = [];
  chartStore.co2.values = [];

  chartStore.tvoc.labels = [];
  chartStore.tvoc.values = [];
}

function padSingle(store) {
  while (store.labels.length < MAX_POINTS) {
    store.labels.unshift("");
    store.values.unshift(null);
  }

  if (store.labels.length > MAX_POINTS) {
    store.labels = store.labels.slice(-MAX_POINTS);
    store.values = store.values.slice(-MAX_POINTS);
  }
}

function padChartTo20() {
  padSingle(chartStore.mq7);
  padSingle(chartStore.dust);
  padSingle(chartStore.co2);
  padSingle(chartStore.tvoc);
}

function getDatasetByType(type) {
  switch (type) {
    case "mq7":
      return chartStore.mq7;
    case "dust":
      return chartStore.dust;
    case "co2":
      return chartStore.co2;
    case "tvoc":
      return chartStore.tvoc;
    default:
      return chartStore.co2;
  }
}

function getChartTitle(type) {
  switch (type) {
    case "mq7":
      return "一氧化碳（CO）每分鐘變化";
    case "dust":
      return "粉塵濃度每分鐘變化";
    case "co2":
      return "二氧化碳（CO₂）每分鐘變化";
    case "tvoc":
      return "總揮發性有機物（TVOC）每分鐘變化";
    default:
      return "二氧化碳（CO₂）每分鐘變化";
  }
}

function updateChart(type) {
  try {
    const canvas = document.getElementById("mainChart");
    if (!canvas) {
      console.error("找不到 canvas#mainChart");
      return;
    }

    if (typeof Chart === "undefined") {
      console.error("Chart.js 沒有載入");
      return;
    }

    const dataset = getDatasetByType(type);
    const labels = dataset.labels || [];
    const values = dataset.values || [];

    if (chartTitleEl) {
      chartTitleEl.textContent = getChartTitle(type);
    }

    if (!chart) {
      const ctx = canvas.getContext("2d");
      chart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: getChartTitle(type),
              data: values,
              tension: 0.25,
              spanGaps: true,
              borderWidth: 2,
              pointRadius: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: {
              display: true
            }
          },
          scales: {
            x: {
              ticks: {
                autoSkip: false,
                maxRotation: 0,
                minRotation: 0
              }
            },
            y: {
              beginAtZero: true
            }
          }
        }
      });
      return;
    }

    chart.data.labels = labels;
    chart.data.datasets[0].label = getChartTitle(type);
    chart.data.datasets[0].data = values;
    chart.update();
  } catch (err) {
    console.error("updateChart 發生錯誤：", err);
  }
}

function updateValueCards(data) {
  if (mq7ValueEl) mq7ValueEl.textContent = data.mq7 ?? "--";
  if (dustValueEl) dustValueEl.textContent = data.dust ?? "--";
  if (co2ValueEl) co2ValueEl.textContent = data.co2 ?? "--";
  if (tvocValueEl) tvocValueEl.textContent = data.tvoc ?? "--";
}

function updateRawData(text) {
  if (rawDataEl) {
    rawDataEl.textContent = text || "等待資料中...";
  }
}

function saveCsvToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, rawCsv);
  } catch (err) {
    console.warn("localStorage 儲存失敗：", err);
  }
}

function loadCsvFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      rawCsv = saved;

      initChart(rawCsv);

      const rows = saved
        .replace(/\r/g, "")
        .trim()
        .split("\n")
        .map((r) => r.trim())
        .filter((r) => r);

      if (rows.length > 1) {
        const last = rows[rows.length - 1].split(",").map((x) => x.trim());
        if (last.length >= 5) {
          updateValueCards({
            mq7: last[1],
            dust: last[2],
            co2: last[3],
            tvoc: last[4]
          });
          updateRawData(rows[rows.length - 1]);
        }
      }
    } else {
      initChart(rawCsv);
    }
  } catch (err) {
    console.warn("localStorage 載入失敗：", err);
    initChart(rawCsv);
  }
}

function initChart(csv) {
  try {
    clearAllChartData();

    if (!csv || !String(csv).trim()) {
      padChartTo20();
      updateChart(chartSelector ? chartSelector.value : "co2");
      return;
    }

    let rows = String(csv)
      .replace(/\r/g, "")
      .trim()
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => r);

    if (rows.length <= 1) {
      padChartTo20();
      updateChart(chartSelector ? chartSelector.value : "co2");
      return;
    }

    rows = rows.slice(1);

    const parsed = rows
      .map((r) => {
        const cols = r.split(",").map((c) => c.trim());
        if (cols.length < 5) return null;

        const [time, mq7, dust, co2, tvoc] = cols;
        const ts = parseTimeToTimestamp(time);

        if (isNaN(ts)) return null;

        return {
          time,
          mq7: toNumberOrNull(mq7),
          dust: toNumberOrNull(dust),
          co2: toNumberOrNull(co2),
          tvoc: toNumberOrNull(tvoc),
          ts
        };
      })
      .filter(Boolean);

    parsed.sort((a, b) => a.ts - b.ts);

    const lastRows = parsed.slice(-MAX_POINTS);

    lastRows.forEach((row) => {
      const label = extractMinuteLabel(row.time) || "";

      chartStore.mq7.labels.push(label);
      chartStore.mq7.values.push(row.mq7);

      chartStore.dust.labels.push(label);
      chartStore.dust.values.push(row.dust);

      chartStore.co2.labels.push(label);
      chartStore.co2.values.push(row.co2);

      chartStore.tvoc.labels.push(label);
      chartStore.tvoc.values.push(row.tvoc);
    });

    padChartTo20();

    const nonEmpty = chartStore.co2.labels.filter((x) => x !== "");
    lastMinute = nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : null;

    updateChart(chartSelector ? chartSelector.value : "co2");
  } catch (err) {
    console.error("initChart 發生錯誤：", err);
  }
}

function appendDataRow(data) {
  let nowText = "";

  if (data.time) {
    nowText = normalizeArduinoTimeToMinute(data.time);
  } else {
    nowText = formatTimeForCsv(new Date());
  }

  const minuteLabel = extractMinuteLabel(nowText);

  if (minuteLabel === lastMinute) {
    return;
  }

  lastMinute = minuteLabel;

  const row = [
    nowText,
    data.mq7 ?? "",
    data.dust ?? "",
    data.co2 ?? "",
    data.tvoc ?? ""
  ].join(",");

  rawCsv += row + "\n";
  saveCsvToStorage();
  updateRawData(row);
  initChart(rawCsv);
}

function parseSerialLine(line) {
  const clean = String(line).trim();
  if (!clean) return null;

  updateRawData(clean);

  // 只處理即時資料
  if (!clean.startsWith("TYPE=LIVE")) {
    return null;
  }

  const result = {
    time: "",
    mq7: null,
    dust: null,
    co2: null,
    tvoc: null
  };

  const parts = clean.split("|").map((p) => p.trim());

  parts.forEach((part) => {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) return;

    const key = part.slice(0, eqIndex).trim().toLowerCase();
    const value = part.slice(eqIndex + 1).trim();

    if (key === "time") result.time = value;
    if (key === "mq7") result.mq7 = toNumberOrNull(value);
    if (key === "dust") result.dust = toNumberOrNull(value);
    if (key === "co2") result.co2 = toNumberOrNull(value);
    if (key === "tvoc") result.tvoc = toNumberOrNull(value);
  });

  const hasAny =
    result.mq7 !== null ||
    result.dust !== null ||
    result.co2 !== null ||
    result.tvoc !== null;

  return hasAny ? result : null;
}

function downloadCsv() {
  try {
    const blob = new Blob([rawCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "air_monitor_history.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    if (downloadStatusEl) {
      downloadStatusEl.textContent = "下載完成";
    }
  } catch (err) {
    console.error("downloadCsv 發生錯誤：", err);
    if (downloadStatusEl) {
      downloadStatusEl.textContent = "下載失敗";
    }
  }
}

function queryHistory() {
  if (!historyOutputEl) return;

  const startText = startTimeEl ? startTimeEl.value.trim() : "";
  const endText = endTimeEl ? endTimeEl.value.trim() : "";

  if (!startText || !endText) {
    historyOutputEl.textContent = "請輸入開始與結束時間";
    return;
  }

  const startTs = parseHourToTimestamp(startText, false);
  const endTs = parseHourToTimestamp(endText, true);

  if (isNaN(startTs) || isNaN(endTs)) {
    historyOutputEl.textContent = "格式錯誤，請使用：YYYY/MM/DD HH";
    return;
  }

  if (startTs > endTs) {
    historyOutputEl.textContent = "開始時間不能晚於結束時間";
    return;
  }

  const rows = rawCsv
    .replace(/\r/g, "")
    .trim()
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r);

  if (rows.length <= 1) {
    historyOutputEl.textContent = "目前沒有歷史資料";
    return;
  }

  const matched = rows.slice(1).filter((r) => {
    const cols = r.split(",").map((c) => c.trim());
    if (cols.length < 5) return false;

    const ts = parseTimeToTimestamp(cols[0]);
    if (isNaN(ts)) return false;

    return ts >= startTs && ts <= endTs;
  });

  if (!matched.length) {
    historyOutputEl.textContent = "查無資料";
    return;
  }

  historyOutputEl.textContent = [
    "time,mq7,dust,co2,tvoc",
    ...matched
  ].join("\n");
}

function clearHistory() {
  rawCsv = "time,mq7,dust,co2,tvoc\n";
  lastMinute = null;

  clearAllChartData();
  padChartTo20();

  if (mq7ValueEl) mq7ValueEl.textContent = "--";
  if (dustValueEl) dustValueEl.textContent = "--";
  if (co2ValueEl) co2ValueEl.textContent = "--";
  if (tvocValueEl) tvocValueEl.textContent = "--";

  if (rawDataEl) rawDataEl.textContent = "等待資料中...";
  if (historyOutputEl) historyOutputEl.textContent = "尚未查詢";
  if (downloadStatusEl) downloadStatusEl.textContent = "尚未下載";
  if (startTimeEl) startTimeEl.value = "";
  if (endTimeEl) endTimeEl.value = "";

  saveCsvToStorage();
  updateChart(chartSelector ? chartSelector.value : "co2");
}

async function disconnectSerial() {
  try {
    keepReading = false;

    if (reader) {
      try {
        await reader.cancel();
      } catch (err) {
        console.warn("reader.cancel 失敗：", err);
      }
      reader = null;
    }

    if (inputDone) {
      try {
        await inputDone.catch(() => {});
      } catch (err) {
        console.warn("inputDone 結束錯誤：", err);
      }
      inputDone = null;
    }

    if (port) {
      try {
        await port.close();
      } catch (err) {
        console.warn("port.close 失敗：", err);
      }
      port = null;
    }

    setStatus("尚未連接");
    if (connectBtn) connectBtn.textContent = "連接 Arduino";
  } catch (err) {
    console.error("disconnectSerial 發生錯誤：", err);
  }
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    alert("這個瀏覽器不支援 Web Serial，請使用 Chrome 或 Edge。");
    return;
  }

  try {
    if (port) {
      await disconnectSerial();
      return;
    }

    port = await navigator.serial.requestPort();

    const BAUD_RATE = 9600;
    await port.open({ baudRate: BAUD_RATE });

    setStatus(`已連接（${BAUD_RATE}）`);
    if (connectBtn) connectBtn.textContent = "中斷連線";

    keepReading = true;

    const decoder = new TextDecoderStream();
    inputDone = port.readable.pipeTo(decoder.writable);
    const inputStream = decoder.readable;
    reader = inputStream.getReader();

    let buffer = "";

    while (keepReading) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      buffer += value;

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const parsed = parseSerialLine(line);
        if (!parsed) continue;

        updateValueCards(parsed);
        appendDataRow(parsed);
      }
    }
  } catch (err) {
    console.error("connectSerial 發生錯誤：", err);
    setStatus("連線失敗");
    await disconnectSerial();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  connectBtn = document.getElementById("connectBtn");
  statusEl = document.getElementById("status");
  timeValueEl = document.getElementById("timeValue");

  mq7ValueEl = document.getElementById("mq7Value");
  dustValueEl = document.getElementById("dustValue");
  co2ValueEl = document.getElementById("co2Value");
  tvocValueEl = document.getElementById("tvocValue");

  rawDataEl = document.getElementById("rawData");

  chartTitleEl = document.getElementById("chartTitle");
  chartSelector = document.getElementById("chartSelector");

  downloadCsvBtn = document.getElementById("downloadCsvBtn");
  downloadStatusEl = document.getElementById("downloadStatus");

  startTimeEl = document.getElementById("startTime");
  endTimeEl = document.getElementById("endTime");
  queryBtn = document.getElementById("queryBtn");
  clearBtn = document.getElementById("clearBtn");
  historyOutputEl = document.getElementById("historyOutput");

  updateHeaderTime();
  setInterval(updateHeaderTime, 1000);

  loadCsvFromStorage();

  if (chartSelector) {
    chartSelector.addEventListener("change", () => {
      updateChart(chartSelector.value);
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener("click", async () => {
      await connectSerial();
    });
  }

  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener("click", () => {
      downloadCsv();
    });
  }

  if (queryBtn) {
    queryBtn.addEventListener("click", () => {
      queryHistory();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearHistory();
    });
  }

  updateChart(chartSelector ? chartSelector.value : "co2");
});
