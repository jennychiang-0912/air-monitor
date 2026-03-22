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

let latestRawLine = "";
let rawUpdateTimer = null;
let chartUpdateTimer = null;

const MAX_POINTS = 20;

const chartStore = {
@@ -74,7 +78,8 @@
      {
        label: "CO₂",
        data: chartStore.co2.values,
        tension: 0.3
        tension: 0.3,
        spanGaps: true
      }
    ]
  },
@@ -96,6 +101,15 @@
  mainChart.update();
}

function requestChartUpdate() {
  if (chartUpdateTimer) return;

  chartUpdateTimer = setTimeout(() => {
    updateChart(chartSelector.value);
    chartUpdateTimer = null;
  }, 200);
}

chartSelector.addEventListener("change", () => {
  updateChart(chartSelector.value);
});
@@ -118,8 +132,11 @@
    port.readable.pipeTo(decoder.writable);
    reader = decoder.readable.getReader();

    shouldInitChartFromEEPROM = true;
    await sendCommand("EXPORT");
    // 先讓 LIVE 資料開始跑，再延後抓 EEPROM 歷史資料
    setTimeout(async () => {
      shouldInitChartFromEEPROM = true;
      await sendCommand("EXPORT");
    }, 800);

    let buffer = "";

@@ -167,7 +184,15 @@
          continue;
        }

        rawData.textContent = line;
        latestRawLine = line;

        if (!rawUpdateTimer) {
          rawUpdateTimer = setTimeout(() => {
            rawData.textContent = latestRawLine;
            rawUpdateTimer = null;
          }, 300);
        }

        parse(line);
      }
    }
@@ -197,6 +222,7 @@
  const minute = extractMinuteLabel(obj.TIME);
  if (!minute) return;

  // 同一分鐘只收一次，避免一分鐘內重複塞很多點
  if (minute === lastMinute) return;
  lastMinute = minute;

@@ -205,7 +231,7 @@
  push(chartStore.co2, minute, toNumberOrNull(obj.CO2));
  push(chartStore.tvoc, minute, toNumberOrNull(obj.TVOC));

  updateChart(chartSelector.value);
  requestChartUpdate();
}

function push(store, label, value) {
@@ -273,13 +299,14 @@
    return;
  }

  const header = rows[0];
  rows = rows.slice(1);

  // 如果 Arduino 輸出的順序是「新 -> 舊」
  // 這裡 reverse 成「舊 -> 新」，讓最新資料固定在最右邊
  // 假設 Arduino EXPORT 順序可能是「新 -> 舊」
  // reverse 後統一成「舊 -> 新」
  rows.reverse();

  // 只取最後 20 筆，效果就是：
  // 左邊較舊、右邊最新
  const lastRows = rows.slice(-MAX_POINTS);

  lastRows.forEach((r) => {
@@ -302,10 +329,12 @@
    chartStore.tvoc.values.push(toNumberOrNull(tvoc));
  });

  // 不足 20 筆就往左補空白
  // 這樣最新資料會維持在最右邊
  padChartTo20();

  const activeStore = chartStore[chartSelector.value];
  const nonEmptyLabels = activeStore.labels.filter((x) => x !== "");
  // 記住目前最右邊那個實際分鐘，避免 LIVE 重複塞同分鐘
  const nonEmptyLabels = chartStore.co2.labels.filter((x) => x !== "");
  if (nonEmptyLabels.length > 0) {
    lastMinute = nonEmptyLabels[nonEmptyLabels.length - 1];
  } else {
