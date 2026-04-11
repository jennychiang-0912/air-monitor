let port = null;
let reader = null;
let inputDone = null;
let keepReading = false;
let chart = null;
let lastMinute = null;

const MAX_POINTS = 20;
const STORAGE_KEY = "air_monitor_history_csv";
let rawCsv = "time,mq7,dust,co2,tvoc\n";

const chartStore = {
  mq7: { labels: [], values: [] },
  dust: { labels: [], values: [] },
  co2: { labels: [], values: [] },
  tvoc: { labels: [], values: [] }
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  if (els.status) els.status.textContent = text;
}

function setRawData(text) {
  if (els.rawData) els.rawData.textContent = text || "等待資料中...";
}

function setCardValues(data) {
  if (els.mq7Value) els.mq7Value.textContent = data.mq7 ?? "--";
  if (els.dustValue) els.dustValue.textContent = data.dust ?? "--";
  if (els.co2Value) els.co2Value.textContent = data.co2 ?? "--";
  if (els.tvocValue) els.tvocValue.textContent = data.tvoc ?? "--";
}

function updateHeaderTime() {
  if (!els.timeValue) return;
  const now = new Date();
  els.timeValue.textContent = formatDateTime(now, true);
}

function formatDateTime(date, withSeconds = false) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");

  return withSeconds
    ? `${y}/${mo}/${d} ${h}:${mi}:${s}`
    : `${y}/${mo}/${d} ${h}:${mi}`;
}

function normalizeTimeToMinute(timeStr) {
  if (!timeStr) return "";
  const clean = String(timeStr).trim();
  const m = clean.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return clean;
  const [, y, mo, d, h, mi] = m;
  return `${y}/${mo}/${d} ${h}:${mi}`;
}

function minuteLabel(timeStr) {
  if (!timeStr) return "";
  const m = String(timeStr).trim().match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return "";
  return `${m[4]}:${m[5]}`;
}

function parseMinuteTimestamp(timeStr) {
  if (!timeStr) return NaN;
  const m = String(timeStr).trim().match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
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

function parseHourTimestamp(hourStr, endOfHour = false) {
  if (!hourStr) return NaN;
  const m = String(hourStr).trim().match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2})$/);
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

function getChartTitle(type) {
  const titles = {
    mq7: "一氧化碳（CO）每分鐘變化",
    dust: "粉塵濃度每分鐘變化",
    co2: "二氧化碳（CO₂）每分鐘變化",
    tvoc: "總揮發性有機物（TVOC）每分鐘變化"
  };
  return titles[type] || titles.co2;
}

function resetChartStore() {
  Object.keys(chartStore).forEach((key) => {
    chartStore[key].labels = [];
    chartStore[key].values = [];
  });
}

function padStore(store) {
  while (store.labels.length < MAX_POINTS) {
    store.labels.unshift("");
    store.values.unshift(null);
  }
  if (store.labels.length > MAX_POINTS) {
    store.labels = store.labels.slice(-MAX_POINTS);
    store.values = store.values.slice(-MAX_POINTS);
  }
}

function padAllStores() {
  Object.values(chartStore).forEach(padStore);
}

function drawChart(type) {
  const canvas = $("mainChart");
  if (!canvas || typeof Chart === "undefined") return;

  const dataSet = chartStore[type] || chartStore.co2;

  if (els.chartTitle) {
    els.chartTitle.textContent = getChartTitle(type);
  }

  if (!chart) {
    chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: dataSet.labels,
        datasets: [{
          label: getChartTitle(type),
          data: dataSet.values,
          tension: 0.25,
          spanGaps: true,
          borderWidth: 2,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: true }
        },
        scales: {
          x: {
            ticks: {
              autoSkip: false,
              maxRotation: 0,
              minRotation: 0
            }
          },
          y: { beginAtZero: true }
        }
      }
    });
    return;
  }

  chart.data.labels = dataSet.labels;
  chart.data.datasets[0].label = getChartTitle(type);
  chart.data.datasets[0].data = dataSet.values;
  chart.update();
}

function saveCsv() {
  try {
    localStorage.setItem(STORAGE_KEY, rawCsv);
  } catch (err) {
    console.warn("localStorage 儲存失敗：", err);
  }
}

function rebuildChartFromCsv(csv) {
  resetChartStore();

  const rows = String(csv || "")
    .replace(/\r/g, "")
    .trim()
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  if (rows.length <= 1) {
    padAllStores();
    drawChart(els.chartSelector?.value || "co2");
    return;
  }

  const parsed = rows
    .slice(1)
    .map((r) => {
      const [time, mq7, dust, co2, tvoc] = r.split(",").map((x) => x.trim());
      const ts = parseMinuteTimestamp(time);
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
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_POINTS);

  parsed.forEach((row) => {
    const label = minuteLabel(row.time);
    chartStore.mq7.labels.push(label);
    chartStore.mq7.values.push(row.mq7);

    chartStore.dust.labels.push(label);
    chartStore.dust.values.push(row.dust);

    chartStore.co2.labels.push(label);
    chartStore.co2.values.push(row.co2);

    chartStore.tvoc.labels.push(label);
    chartStore.tvoc.values.push(row.tvoc);
  });

  padAllStores();

  const nonEmpty = chartStore.co2.labels.filter((x) => x !== "");
  lastMinute = nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : null;

  drawChart(els.chartSelector?.value || "co2");
}

function loadCsv() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      rawCsv = saved;

      const rows = saved
        .replace(/\r/g, "")
        .trim()
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);

      if (rows.length > 1) {
        const last = rows[rows.length - 1].split(",").map((x) => x.trim());
        setCardValues({
          mq7: last[1],
          dust: last[2],
          co2: last[3],
          tvoc: last[4]
        });
        setRawData(rows[rows.length - 1]);
      }
    }

    rebuildChartFromCsv(rawCsv);
  } catch (err) {
    console.warn("localStorage 載入失敗：", err);
    rebuildChartFromCsv(rawCsv);
  }
}

function addDataRow(data) {
  const timeText = data.time
    ? normalizeTimeToMinute(data.time)
    : formatDateTime(new Date(), false);

  const label = minuteLabel(timeText);
  if (label === lastMinute) return;

  lastMinute = label;

  const row = [
    timeText,
    data.mq7 ?? "",
    data.dust ?? "",
    data.co2 ?? "",
    data.tvoc ?? ""
  ].join(",");

  rawCsv += row + "\n";
  saveCsv();
  setRawData(row);
  rebuildChartFromCsv(rawCsv);
}

function parseSerialLine(line) {
  const clean = String(line).trim();
  if (!clean) return null;

  setRawData(clean);

  if (!clean.startsWith("TYPE=LIVE")) return null;

  const result = {
    time: "",
    mq7: null,
    dust: null,
    co2: null,
    tvoc: null
  };

  clean.split("|").map((p) => p.trim()).forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;

    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();

    if (key === "time") result.time = value;
    if (key === "mq7") result.mq7 = toNumberOrNull(value);
    if (key === "dust") result.dust = toNumberOrNull(value);
    if (key === "co2") result.co2 = toNumberOrNull(value);
    if (key === "tvoc") result.tvoc = toNumberOrNull(value);
  });

  const hasData = ["mq7", "dust", "co2", "tvoc"].some((k) => result[k] !== null);
  return hasData ? result : null;
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

    if (els.downloadStatus) els.downloadStatus.textContent = "下載完成";
  } catch (err) {
    console.error(err);
    if (els.downloadStatus) els.downloadStatus.textContent = "下載失敗";
  }
}

function queryHistory() {
  if (!els.historyOutput) return;

  const startText = els.startTime?.value.trim() || "";
  const endText = els.endTime?.value.trim() || "";

  if (!startText || !endText) {
    els.historyOutput.textContent = "請輸入開始與結束時間";
    return;
  }

  const startTs = parseHourTimestamp(startText, false);
  const endTs = parseHourTimestamp(endText, true);

  if (isNaN(startTs) || isNaN(endTs)) {
    els.historyOutput.textContent = "格式錯誤，請使用：YYYY/MM/DD HH";
    return;
  }

  if (startTs > endTs) {
    els.historyOutput.textContent = "開始時間不能晚於結束時間";
    return;
  }

  const rows = rawCsv
    .replace(/\r/g, "")
    .trim()
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  if (rows.length <= 1) {
    els.historyOutput.textContent = "目前沒有歷史資料";
    return;
  }

  const matched = rows.slice(1).filter((r) => {
    const cols = r.split(",").map((c) => c.trim());
    if (cols.length < 5) return false;

    const ts = parseMinuteTimestamp(cols[0]);
    return !isNaN(ts) && ts >= startTs && ts <= endTs;
  });

  els.historyOutput.textContent = matched.length
    ? ["time,mq7,dust,co2,tvoc", ...matched].join("\n")
    : "查無資料";
}

function clearHistory() {
  rawCsv = "time,mq7,dust,co2,tvoc\n";
  lastMinute = null;

  resetChartStore();
  padAllStores();

  setCardValues({ mq7: "--", dust: "--", co2: "--", tvoc: "--" });
  setRawData("等待資料中...");

  if (els.historyOutput) els.historyOutput.textContent = "尚未查詢";
  if (els.downloadStatus) els.downloadStatus.textContent = "尚未下載";
  if (els.startTime) els.startTime.value = "";
  if (els.endTime) els.endTime.value = "";

  saveCsv();
  drawChart(els.chartSelector?.value || "co2");
}

async function disconnectSerial() {
  keepReading = false;

  try {
    if (reader) {
      await reader.cancel();
      reader = null;
    }
  } catch (err) {
    console.warn("reader.cancel 失敗：", err);
  }

  try {
    if (inputDone) {
      await inputDone.catch(() => {});
      inputDone = null;
    }
  } catch (err) {
    console.warn("inputDone 結束錯誤：", err);
  }

  try {
    if (port) {
      await port.close();
      port = null;
    }
  } catch (err) {
    console.warn("port.close 失敗：", err);
  }

  setStatus("尚未連接");
  if (els.connectBtn) els.connectBtn.textContent = "連接 Arduino";
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
    await port.open({ baudRate: 9600 });

    setStatus("已連接（9600）");
    if (els.connectBtn) els.connectBtn.textContent = "中斷連線";

    keepReading = true;

    const decoder = new TextDecoderStream();
    inputDone = port.readable.pipeTo(decoder.writable);
    reader = decoder.readable.getReader();

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

        setCardValues(parsed);
        addDataRow(parsed);
      }
    }
  } catch (err) {
    console.error("connectSerial 發生錯誤：", err);
    setStatus("連線失敗");
    await disconnectSerial();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  [
    "connectBtn", "status", "timeValue",
    "mq7Value", "dustValue", "co2Value", "tvocValue",
    "rawData", "chartTitle", "chartSelector",
    "downloadCsvBtn", "downloadStatus",
    "startTime", "endTime", "queryBtn", "clearBtn", "historyOutput"
  ].forEach((id) => {
    els[id] = $(id);
  });

  updateHeaderTime();
  setInterval(updateHeaderTime, 1000);

  loadCsv();

  els.chartSelector?.addEventListener("change", () => {
    drawChart(els.chartSelector.value);
  });

  els.connectBtn?.addEventListener("click", connectSerial);
  els.downloadCsvBtn?.addEventListener("click", downloadCsv);
  els.queryBtn?.addEventListener("click", queryHistory);
  els.clearBtn?.addEventListener("click", clearHistory);

  drawChart(els.chartSelector?.value || "co2");
});
