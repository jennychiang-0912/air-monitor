const connectBtn = document.getElementById("connectBtn");
const statusText = document.getElementById("status");
const rawData = document.getElementById("rawData");
const chartSelector = document.getElementById("chartSelector");
const chartTitle = document.getElementById("chartTitle");

const timeValue = document.getElementById("timeValue");
const mq7Value = document.getElementById("mq7Value");
const dustValue = document.getElementById("dustValue");
const co2Value = document.getElementById("co2Value");
const tvocValue = document.getElementById("tvocValue");

const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const downloadStatus = document.getElementById("downloadStatus");

const queryBtn = document.getElementById("queryBtn");
const clearBtn = document.getElementById("clearBtn");
const startTimeInput = document.getElementById("startTime");
const endTimeInput = document.getElementById("endTime");
const historyOutput = document.getElementById("historyOutput");

const historyTable = document.getElementById("historyTable");
const historyTableHead = historyTable?.querySelector("thead");
const historyTableBody = historyTable?.querySelector("tbody");

let port = null;
let reader = null;
let lastMinute = null;

let isCSVMode = false;
let csvBuffer = "";
let shouldDownloadCSV = false;
let shouldShowHistory = false;
let shouldInitChartFromEEPROM = false;

const MAX_POINTS = 20;

const chartStore = {
  mq7: {
    labels: [],
    values: [],
    label: "CO",
    title: "一氧化碳（CO）每分鐘變化"
  },
  dust: {
    labels: [],
    values: [],
    label: "Dust",
    title: "粉塵濃度每分鐘變化"
  },
  co2: {
    labels: [],
    values: [],
    label: "CO₂",
    title: "二氧化碳（CO₂）每分鐘變化"
  },
  tvoc: {
    labels: [],
    values: [],
    label: "TVOC",
    title: "TVOC 每分鐘變化"
  }
};

let mainChart = null;

const ctx = document.getElementById("mainChart").getContext("2d");

mainChart = new Chart(ctx, {
  type: "line",
  data: {
    labels: chartStore.co2.labels,
    datasets: [
      {
        label: "CO₂",
        data: chartStore.co2.values,
        tension: 0.3
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false
  }
});

function updateChart(type) {
  const data = chartStore[type];
  chartTitle.textContent = data.title;

  mainChart.data.labels = [...data.labels];
  mainChart.data.datasets[0].data = [...data.values];
  mainChart.data.datasets[0].label = data.label;

  mainChart.update();
}

chartSelector.addEventListener("change", () => {
  updateChart(chartSelector.value);
});

async function sendCommand(cmd) {
  if (!port?.writable) return;
  const writer = port.writable.getWriter();
  await writer.write(new TextEncoder().encode(cmd + "\n"));
  writer.releaseLock();
}

async function connectArduino() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    statusText.textContent = "已連接 Arduino";

    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    reader = decoder.readable.getReader();

    shouldInitChartFromEEPROM = true;
    await sendCommand("EXPORT");

    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line === "TYPE=CSV_BEGIN") {
          isCSVMode = true;
          csvBuffer = "";
          continue;
        }

        if (line === "TYPE=CSV_END") {
          isCSVMode = false;

          if (shouldInitChartFromEEPROM) {
            initChart(csvBuffer);
            shouldInitChartFromEEPROM = false;
          }

          if (shouldDownloadCSV) {
            downloadCSV(csvBuffer);
            shouldDownloadCSV = false;
          }

          if (shouldShowHistory) {
            renderHistoryTable(csvBuffer);
            shouldShowHistory = false;
          }

          continue;
        }

        if (isCSVMode) {
          csvBuffer += line + "\n";
          continue;
        }

        rawData.textContent = line;
        parse(line);
      }
    }
  } catch (e) {
    statusText.textContent = "連接失敗";
    console.error(e);
  }
}

connectBtn.addEventListener("click", connectArduino);

function parse(line) {
  const obj = {};
  line.split("|").forEach((p) => {
    const [k, v] = p.split("=");
    if (k && v) obj[k.trim()] = v.trim();
  });

  if (obj.TYPE !== "LIVE") return;

  timeValue.textContent = obj.TIME || "--";
  mq7Value.textContent = obj.MQ7 || "--";
  dustValue.textContent = obj.Dust || "--";
  co2Value.textContent = obj.CO2 || "--";
  tvocValue.textContent = obj.TVOC || "--";

  const minute = extractMinuteLabel(obj.TIME);
  if (!minute) return;

  if (minute === lastMinute) return;
  lastMinute = minute;

  push(chartStore.mq7, minute, toNumberOrNull(obj.MQ7));
  push(chartStore.dust, minute, toNumberOrNull(obj.Dust));
  push(chartStore.co2, minute, toNumberOrNull(obj.CO2));
  push(chartStore.tvoc, minute, toNumberOrNull(obj.TVOC));

  updateChart(chartSelector.value);
}

function push(store, label, value) {
  store.labels.push(label);
  store.values.push(value);

  if (store.labels.length > MAX_POINTS) {
    store.labels.shift();
    store.values.shift();
  }
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractMinuteLabel(timeStr) {
  if (!timeStr) return "";

  const s = String(timeStr).trim();

  if (s.length >= 16) {
    return s.slice(11, 16);
  }

  const match = s.match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function clearAllChartData() {
  Object.values(chartStore).forEach((store) => {
    store.labels = [];
    store.values = [];
  });
}

function padChartTo20() {
  Object.values(chartStore).forEach((store) => {
    while (store.labels.length < MAX_POINTS) {
      store.labels.unshift("");
      store.values.unshift(null);
    }
  });
}

function initChart(csv) {
  clearAllChartData();

  if (!csv || !csv.trim()) {
    padChartTo20();
    updateChart(chartSelector.value);
    return;
  }

  let rows = csv
    .trim()
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r);

  if (rows.length <= 1) {
    padChartTo20();
    updateChart(chartSelector.value);
    return;
  }

  const header = rows[0];
  rows = rows.slice(1);

  // 如果 Arduino 輸出的順序是「新 -> 舊」
  // 這裡 reverse 成「舊 -> 新」，讓最新資料固定在最右邊
  rows.reverse();

  const lastRows = rows.slice(-MAX_POINTS);

  lastRows.forEach((r) => {
    const cols = r.split(",");
    if (cols.length < 5) return;

    const [time, mq7, dust, co2, tvoc] = cols;
    const label = extractMinuteLabel(time);

    chartStore.mq7.labels.push(label);
    chartStore.mq7.values.push(toNumberOrNull(mq7));

    chartStore.dust.labels.push(label);
    chartStore.dust.values.push(toNumberOrNull(dust));

    chartStore.co2.labels.push(label);
    chartStore.co2.values.push(toNumberOrNull(co2));

    chartStore.tvoc.labels.push(label);
    chartStore.tvoc.values.push(toNumberOrNull(tvoc));
  });

  padChartTo20();

  const activeStore = chartStore[chartSelector.value];
  const nonEmptyLabels = activeStore.labels.filter((x) => x !== "");
  if (nonEmptyLabels.length > 0) {
    lastMinute = nonEmptyLabels[nonEmptyLabels.length - 1];
  } else {
    lastMinute = null;
  }

  updateChart(chartSelector.value);
}

function downloadCSV(text) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + text], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "data.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

if (downloadCsvBtn) {
  downloadCsvBtn.addEventListener("click", async () => {
    shouldDownloadCSV = true;
    downloadStatus.textContent = "匯出中...";
    await sendCommand("EXPORT");
    setTimeout(() => {
      downloadStatus.textContent = "下載完成";
    }, 500);
  });
}

queryBtn?.addEventListener("click", async () => {
  const s = normalize(startTimeInput.value);
  const e = normalize(endTimeInput.value);

  if (!s || !e) {
    alert("請先輸入開始與結束時間");
    return;
  }

  shouldShowHistory = true;
  await sendCommand(`QUERY,${s},${e}`);
});

clearBtn?.addEventListener("click", () => {
  if (historyTableBody) historyTableBody.innerHTML = "";
  if (historyTableHead) historyTableHead.innerHTML = "";
  if (historyTable) historyTable.style.display = "none";
  if (historyOutput) historyOutput.textContent = "";
});

function normalize(t) {
  if (!t) return "";
  return t.replace("T", " ").replace(/:\d{2}$/, "");
}

function renderHistoryTable(csv) {
  if (!csv || !csv.trim()) {
    historyTable.style.display = "none";
    return;
  }

  const rows = csv
    .trim()
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r);

  if (rows.length === 0) {
    historyTable.style.display = "none";
    return;
  }

  const headers = rows[0].split(",");
  const body = rows.slice(1);

  historyTableHead.innerHTML = `
    <tr>
      ${headers.map((h) => `<th>${h}</th>`).join("")}
    </tr>
  `;

  historyTableBody.innerHTML = body
    .map((r) => {
      const cols = r.split(",");
      return `<tr>${cols.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    })
    .join("");

  historyTable.style.display = "table";
}
