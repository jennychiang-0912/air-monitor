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
  mq7: { labels: [], values: [], label: "CO", title: "一氧化碳（CO）每分鐘變化" },
  dust: { labels: [], values: [], label: "Dust", title: "粉塵濃度每分鐘變化" },
  co2: { labels: [], values: [], label: "CO₂", title: "二氧化碳（CO₂）每分鐘變化" },
  tvoc: { labels: [], values: [], label: "TVOC", title: "TVOC 每分鐘變化" }
};

let mainChart = null;

const ctx = document.getElementById("mainChart").getContext("2d");

mainChart = new Chart(ctx, {
  type: "line",
  data: {
    labels: chartStore.co2.labels,
    datasets: [{
      label: "CO₂",
      data: chartStore.co2.values,
      tension: 0.3
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false
  }
});

function updateChart(type) {
  const data = chartStore[type];
  chartTitle.textContent = data.title;

  mainChart.data.labels = data.labels;
  mainChart.data.datasets[0].data = data.values;
  mainChart.data.datasets[0].label = data.label;

  mainChart.update();
}

chartSelector.addEventListener("change", () => {
  updateChart(chartSelector.value);
});

async function sendCommand(cmd) {
  const writer = port.writable.getWriter();
  await writer.write(new TextEncoder().encode(cmd + "\n"));
  writer.releaseLock();
}

async function connectArduino() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    statusText.textContent = "已連接 Arduino";

    shouldInitChartFromEEPROM = true;
    await sendCommand("EXPORT");

    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    reader = decoder.readable.getReader();

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
  line.split("|").forEach(p => {
    const [k, v] = p.split("=");
    if (k && v) obj[k.trim()] = v.trim();
  });

  if (obj.TYPE !== "LIVE") return;

  timeValue.textContent = obj.TIME;
  mq7Value.textContent = obj.MQ7;
  dustValue.textContent = obj.Dust;
  co2Value.textContent = obj.CO2;
  tvocValue.textContent = obj.TVOC;

  const minute = obj.TIME.slice(11, 16);
  if (minute === lastMinute) return;
  lastMinute = minute;

  push(chartStore.mq7, minute, Number(obj.MQ7));
  push(chartStore.dust, minute, Number(obj.Dust));
  push(chartStore.co2, minute, Number(obj.CO2));
  push(chartStore.tvoc, minute, Number(obj.TVOC));

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

function initChart(csv) {
  const rows = csv.trim().split("\n").slice(1);
  const last = rows.slice(-MAX_POINTS);

  Object.values(chartStore).forEach(s => {
    s.labels = [];
    s.values = [];
  });

  last.forEach(r => {
    const [time, mq7, dust, co2, tvoc] = r.split(",");
    const label = time.slice(11, 16);

    chartStore.mq7.labels.push(label);
    chartStore.mq7.values.push(Number(mq7));

    chartStore.dust.labels.push(label);
    chartStore.dust.values.push(Number(dust));

    chartStore.co2.labels.push(label);
    chartStore.co2.values.push(Number(co2));

    chartStore.tvoc.labels.push(label);
    chartStore.tvoc.values.push(Number(tvoc));
  });

  updateChart(chartSelector.value);
}

function downloadCSV(text) {
  const blob = new Blob([text], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "data.csv";
  a.click();
}

queryBtn.addEventListener("click", async () => {
  const s = normalize(startTimeInput.value);
  const e = normalize(endTimeInput.value);
  shouldShowHistory = true;
  await sendCommand(`QUERY,${s},${e}`);
});

function normalize(t) {
  return t.replace(/:\d{2}$/, "");
}

function renderHistoryTable(csv) {
  const rows = csv.trim().split("\n");
  const headers = rows[0].split(",");
  const body = rows.slice(1);

  historyTableHead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
  historyTableBody.innerHTML = body.map(r =>
    `<tr>${r.split(",").map(c => `<td>${c}</td>`).join("")}</tr>`
  ).join("");

  historyTable.style.display = "table";
}
