let port = null;
let reader = null;
let inputDone = null;
let keepReading = false;

const MAX_POINTS = 20;
const STORAGE_KEY = "air_monitor_history_csv_debug";

let rawCsv = "time,mq7,dust,co2,tvoc\n";
let lastMinute = null;
let chart = null;

let chartSelector = null;
let connectBtn = null;
let downloadBtn = null;
let clearBtn = null;
let statusEl = null;
let timeValueEl = null;

let mq7ValueEl = null;
let dustValueEl = null;
let co2ValueEl = null;
let tvocValueEl = null;

const chartStore = {
  mq7: { labels: [], values: [] },
  dust: { labels: [], values: [] },
  co2: { labels: [], values: [] },
  tvoc: { labels: [], values: [] }
};

function dbg(...args) {
  console.log("[DEBUG]", ...args);
}

window.addEventListener("error", (e) => {
  console.error("[全域錯誤]", e.message, "at", e.filename, e.lineno, e.colno);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[Promise 未處理錯誤]", e.reason);
});

function setStatus(text) {
  dbg("setStatus:", text);
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
      return "MQ-7 CO";
    case "dust":
      return "Dust";
    case "co2":
      return "CO2";
    case "tvoc":
      return "TVOC";
    default:
      return "CO2";
  }
}

function updateChart(type) {
  dbg("updateChart called:", type);

  try {
    const canvas = document.getElementById("sensorChart");
    if (!canvas) {
      console.error("找不到 canvas#sensorChart");
      return;
    }

    if (typeof Chart === "undefined") {
      console.error("Chart.js 沒有載入成功");
      return;
    }

    const dataset = getDatasetByType(type);
    const labels = dataset.labels || [];
    const values = dataset.values || [];

    dbg("chart labels:", labels);
    dbg("chart values:", values);

    if (!chart) {
      dbg("建立新圖表");
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
              spanGaps: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: true },
            title: {
              display: true,
              text: getChartTitle(type)
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

    dbg("更新既有圖表");
    chart.data.labels = labels;
    chart.data.datasets[0].label = getChartTitle(type);
    chart.data.datasets[0].data = values;
    chart.options.plugins.title.text = getChartTitle(type);
    chart.update();
  } catch (err) {
    console.error("updateChart 發生錯誤：", err);
  }
}

function updateValueCards(data) {
  dbg("updateValueCards:", data);
  if (mq7ValueEl) mq7ValueEl.textContent = data.mq7 ?? "--";
  if (dustValueEl) dustValueEl.textContent = data.dust ?? "--";
  if (co2ValueEl) co2ValueEl.textContent = data.co2 ?? "--";
  if (tvocValueEl) tvocValueEl.textContent = data.tvoc ?? "--";
}

function saveCsvToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, rawCsv);
    dbg("CSV 已存入 localStorage");
  } catch (err) {
    console.warn("localStorage 儲存失敗：", err);
  }
}

function loadCsvFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    dbg("讀取 localStorage:", saved);

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
  dbg("initChart called");
  try {
    clearAllChartData();

    if (!csv || !String(csv).trim()) {
      dbg("csv 空的");
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

    dbg("initChart rows:", rows);

    if (rows.length <= 1) {
      dbg("只有表頭或沒資料");
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

    dbg("parsed before sort:", parsed);

    parsed.sort((a, b) => a.ts - b.ts);

    dbg("parsed after sort:", parsed);

    const lastRows = parsed.slice(-MAX_POINTS);
    dbg("lastRows:", lastRows);

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

    dbg("chartStore after init:", JSON.parse(JSON.stringify(chartStore)));

    const nonEmpty = (chartStore.co2.labels || []).filter((x) => x !== "");
    lastMinute = nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : null;
    dbg("lastMinute =", lastMinute);

    updateChart(chartSelector ? chartSelector.value : "co2");
  } catch (err) {
    console.error("initChart 發生錯誤：", err);
  }
}

function downloadCsv() {
  dbg("downloadCsv clicked");
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
  } catch (err) {
    console.error("downloadCsv 發生錯誤：", err);
  }
}

function clearHistory() {
  dbg("clearHistory called");
  rawCsv = "time,mq7,dust,co2,tvoc\n";
  lastMinute = null;

  clearAllChartData();
  padChartTo20();

  if (mq7ValueEl) mq7ValueEl.textContent = "--";
  if (dustValueEl) dustValueEl.textContent = "--";
  if (co2ValueEl) co2ValueEl.textContent = "--";
  if (tvocValueEl) tvocValueEl.textContent = "--";

  saveCsvToStorage();
  updateChart(chartSelector ? chartSelector.value : "co2");
}

function appendDataRow(data) {
  dbg("appendDataRow:", data);

  const nowText = formatTimeForCsv(new Date());
  const minuteLabel = extractMinuteLabel(nowText);

  if (minuteLabel === lastMinute) {
    dbg("同一分鐘資料，略過");
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

  dbg("append row =", row);

  rawCsv += row + "\n";
  saveCsvToStorage();
  initChart(rawCsv);
}

function parseSerialLine(line) {
  const clean = String(line).trim();
  dbg("原始 serial line =", clean);

  if (!clean) return null;

  try {
    if (clean.startsWith("{") && clean.endsWith("}")) {
      const obj = JSON.parse(clean);
      const result = {
        mq7: toNumberOrNull(obj.mq7),
        dust: toNumberOrNull(obj.dust),
        co2: toNumberOrNull(obj.co2),
        tvoc: toNumberOrNull(obj.tvoc)
      };
      dbg("解析成 JSON:", result);
      return result;
    }
  } catch (err) {
    console.warn("JSON 解析失敗:", err);
  }

  const result = {
    mq7: null,
    dust: null,
    co2: null,
    tvoc: null
  };

  const parts = clean.split(/[, ]+/).filter(Boolean);
  dbg("split parts =", parts);

  parts.forEach((part) => {
    const [k, v] = part.split(":");
    if (!k || v == null) return;

    const key = k.trim().toLowerCase();
    const value = toNumberOrNull(v);

    if (key === "mq7") result.mq7 = value;
    if (key === "dust") result.dust = value;
    if (key === "co2") result.co2 = value;
    if (key === "tvoc") result.tvoc = value;
  });

  const hasAny =
    result.mq7 !== null ||
    result.dust !== null ||
    result.co2 !== null ||
    result.tvoc !== null;

  dbg("一般格式解析結果 =", result, "hasAny =", hasAny);

  return hasAny ? result : null;
}

async function disconnectSerial() {
  dbg("disconnectSerial called");

  try {
    keepReading = false;

    if (reader) {
      dbg("reader.cancel()");
      try {
        await reader.cancel();
      } catch (err) {
        console.warn("reader.cancel 失敗：", err);
      }
      reader = null;
    }

    if (inputDone) {
      dbg("等待 inputDone 結束");
      try {
        await inputDone.catch(() => {});
      } catch (err) {
        console.warn("inputDone 結束錯誤：", err);
      }
      inputDone = null;
    }

    if (port) {
      dbg("port.close()");
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
  dbg("connectSerial called");

  if (!("serial" in navigator)) {
    alert("這個瀏覽器不支援 Web Serial，請使用 Chrome 或 Edge。");
    return;
  }

  try {
    if (port) {
      dbg("目前已有 port，改成中斷連線");
      await disconnectSerial();
      return;
    }

    dbg("requestPort 前");
    port = await navigator.serial.requestPort();
    dbg("requestPort 成功，port =", port);

    const BAUD_RATE = 9600;
    dbg("準備 open，baudRate =", BAUD_RATE);

    await port.open({ baudRate: BAUD_RATE });
    dbg("port.open 成功");

    setStatus(`已連接（${BAUD_RATE}）`);
    if (connectBtn) connectBtn.textContent = "中斷連線";

    keepReading = true;

    const decoder = new TextDecoderStream();
    inputDone = port.readable.pipeTo(decoder.writable);
    const inputStream = decoder.readable;
    reader = inputStream.getReader();

    dbg("開始讀取 serial");

    let buffer = "";

    while (keepReading) {
      const { value, done } = await reader.read();
      dbg("reader.read() ->", { value, done });

      if (done) {
        dbg("reader done");
        break;
      }

      if (!value) continue;

      buffer += value;
      dbg("目前 buffer =", buffer);

      let lines = buffer.split("\n");
      buffer = lines.pop() || "";

      dbg("完整 lines =", lines, "剩餘 buffer =", buffer);

      for (const line of lines) {
        const parsed = parseSerialLine(line);
        if (!parsed) {
          dbg("這行解析失敗，略過");
          continue;
        }

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
  dbg("DOMContentLoaded");

  chartSelector = document.getElementById("chartSelector");
  connectBtn = document.getElementById("connectBtn");
  downloadBtn = document.getElementById("downloadBtn");
  clearBtn = document.getElementById("clearBtn");
  statusEl = document.getElementById("status");
  timeValueEl = document.getElementById("timeValue");

  mq7ValueEl = document.getElementById("mq7Value");
  dustValueEl = document.getElementById("dustValue");
  co2ValueEl = document.getElementById("co2Value");
  tvocValueEl = document.getElementById("tvocValue");

  dbg("抓到的元素：", {
    chartSelector,
    connectBtn,
    downloadBtn,
    clearBtn,
    statusEl,
    timeValueEl,
    mq7ValueEl,
    dustValueEl,
    co2ValueEl,
    tvocValueEl
  });

  updateHeaderTime();
  setInterval(updateHeaderTime, 1000);

  loadCsvFromStorage();

  if (chartSelector) {
    chartSelector.addEventListener("change", () => {
      dbg("chartSelector changed:", chartSelector.value);
      updateChart(chartSelector.value);
    });
  } else {
    console.error("找不到 #chartSelector");
  }

  if (connectBtn) {
    dbg("綁定 connectBtn click");
    connectBtn.addEventListener("click", async () => {
      dbg("connectBtn clicked");
      await connectSerial();
    });
  } else {
    console.error("找不到 #connectBtn");
  }

  if (downloadBtn) {
    dbg("綁定 downloadBtn click");
    downloadBtn.addEventListener("click", () => {
      dbg("downloadBtn clicked");
      downloadCsv();
    });
  } else {
    console.error("找不到 #downloadBtn");
  }

  if (clearBtn) {
    dbg("綁定 clearBtn click");
    clearBtn.addEventListener("click", () => {
      dbg("clearBtn clicked");
      clearHistory();
    });
  } else {
    console.error("找不到 #clearBtn");
  }

  updateChart(chartSelector ? chartSelector.value : "co2");
});
