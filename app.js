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

        rawData.textContent 
