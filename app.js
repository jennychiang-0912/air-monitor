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
const historyTableHead = historyTable ? historyTable.querySelector("thead") : null;
const historyTableBody = historyTable ? historyTable.querySelector("tbody") : null;

let port = null;
let reader = null;
let lastMinute = null;

let isCSVMode = false;
let csvBuffer = "";
let shouldDownloadCSV = false;
let shouldShowHistory = false;

const chartStore = {
  mq7: {
    title: "一氧化碳（CO）每分鐘變化",
    label: "CO",
    labels: [],
    values: []
  },
  dust: {
    title: "粉塵濃度每分鐘變化",
    label: "Dust",
    labels: [],
    values: []
  },
  co2: {
    title: "二氧化碳（CO₂）每分鐘變化",
    label: "CO₂",
    labels: [],
    values: []
  },
  tvoc: {
    title: "揮發性有機物（TVOC）每分鐘變化",
    label: "TVOC",
    labels: [],
    values: []
  }
};

const mainChartCanvas = document.getElementById("mainChart");
let mainChart = null;

if (mainChartCanvas) {
  const ctx = mainChartCanvas.getContext("2d");
  mainChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: chartStore.co2.labels,
      datasets: [
        {
          label: chartStore.co2.label,
          data: chartStore.co2.values,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 3,
          fill: false
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
        y: {
          beginAtZero: false
        }
      }
    }
  });
}

if (chartSelector) {
  chartSelector.addEventListener("change", () => {
    updateDisplayedChart(chartSelector.value);
  });
}

function updateDisplayedChart(type) {
  if (!mainChart) return;

  const selected = chartStore[type];
  if (!selected) return;

  if (chartTitle) {
    chartTitle.textContent = selected.title;
  }

  mainChart.data.labels = selected.labels;
  mainChart.data.datasets[0].label = selected.label;
  mainChart.data.datasets[0].data = selected.values;

  updateChartScale(mainChart, selected.values);
  mainChart.update();
}

async function sendCommand(cmd) {
  if (!port || !port.writable) {
    alert("請先連接 Arduino");
    return;
  }

  const encoder = new TextEncoder();
  const writer = port.writable.getWriter();
  await writer.write(encoder.encode(cmd + "\n"));
  writer.releaseLock();
}

async function connectArduino() {
  try {
    if (!("serial" in navigator)) {
      if (statusText) statusText.textContent = "此瀏覽器不支援 Web Serial";
      if (rawData) rawData.textContent = "請改用 Chrome 或 Edge";
      return;
    }

    if (statusText) statusText.textContent = "請選擇 Arduino...";
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    if (statusText) statusText.textContent = "已連接 Arduino";
    if (downloadStatus) downloadStatus.textContent = "尚未下載";

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
          if (historyOutput && shouldShowHistory) {
            historyOutput.textContent = "接收資料中...";
          }
          hideHistoryTable();
          continue;
        }

        if (line === "TYPE=CSV_END") {
          isCSVMode = false;

          if (shouldDownloadCSV && csvBuffer.trim()) {
            downloadCSV(csvBuffer, "air_data.csv");
            shouldDownloadCSV = false;
            if (downloadStatus) downloadStatus.textContent = "下載完成";
          } else if (shouldDownloadCSV) {
            shouldDownloadCSV = false;
            if (downloadStatus) downloadStatus.textContent = "沒有可下載資料";
          }

          if (shouldShowHistory) {
            const hasData = csvBuffer.trim().length > 0;
            if (hasData) {
              renderHistoryTable(csvBuffer);
            } else {
              if (historyOutput) historyOutput.textContent = "查無資料";
              hideHistoryTable();
            }
            shouldShowHistory = false;
          }

          continue;
        }

        if (isCSVMode) {
          csvBuffer += line + "\n";
          continue;
        }

        if (rawData) rawData.textContent = line;
        parse(line);
      }
    }
  } catch (error) {
    if (statusText) statusText.textContent = "連接失敗";
    if (rawData) rawData.textContent = `錯誤：${error.name} - ${error.message}`;
    console.error(error);
  }
}

if (connectBtn) {
  connectBtn.addEventListener("click", connectArduino);
}

if (downloadCsvBtn) {
  downloadCsvBtn.addEventListener("click", async () => {
    if (!port) {
      alert("請先連接 Arduino");
      return;
    }

    csvBuffer = "";
    shouldDownloadCSV = true;
    if (downloadStatus) downloadStatus.textContent = "下載中...";
    await sendCommand("EXPORT");
  });
}

function normalizeQueryTime(input) {
  const text = input.trim();
  const match = text.match(/^(\d{4}\/\d{2}\/\d{2})\s+(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const datePart = match[1];
  const hourPart = match[2];
  return `${datePart} ${hourPart}`;
}

if (queryBtn) {
  queryBtn.addEventListener("click", async () => {
    const startRaw = startTimeInput.value.trim();
    const endRaw = endTimeInput.value.trim();

    if (!startRaw || !endRaw) {
      alert("請輸入開始與結束時間");
      return;
    }

    if (!port) {
      alert("請先連接 Arduino");
      return;
    }

    const start = normalizeQueryTime(startRaw);
    const end = normalizeQueryTime(endRaw);

    if (!start || !end) {
      alert("請使用格式：YYYY/MM/DD HH:MM，例如 2026/03/22 16:00");
      return;
    }

    csvBuffer = "";
    shouldShowHistory = true;
    if (historyOutput) historyOutput.textContent = "查詢中...";
    hideHistoryTable();
    await sendCommand(`QUERY,${start},${end}`);
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if (!port) {
      alert("請先連接 Arduino");
      return;
    }

    const ok = confirm("確定要清除 EEPROM 資料嗎？");
    if (!ok) return;

    await sendCommand("CLEAR");
    if (historyOutput) historyOutput.textContent = "已送出清除指令";
    hideHistoryTable();
  });
}

function parse(line) {
  const parts = line.split("|").map(x => x.trim());
  const data = {};

  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex !== -1) {
      const key = part.substring(0, eqIndex).trim();
      const value = part.substring(eqIndex + 1).trim();
      data[key] = value;
    }
  }

  if (data.TYPE !== "LIVE") return;
  if (!data.TIME) return;

  if (timeValue) {
    timeValue.textContent = data.TIME;
  }

  if (mq7Value && data.MQ7 !== undefined) {
    updateValue(mq7Value, Number(data.MQ7), 200, 400);
  }

  if (dustValue && data.Dust !== undefined) {
    updateValue(dustValue, Number(data.Dust), 300, 600);
  }

  if (co2Value && data.CO2 !== undefined) {
    updateValue(co2Value, Number(data.CO2), 800, 1200);
  }

  if (tvocValue && data.TVOC !== undefined) {
    updateValue(tvocValue, Number(data.TVOC), 200, 400);
  }

  const match = data.TIME.match(/(\d{2}:\d{2}):\d{2}/);
  const minuteLabel = match ? match[1] : null;

  if (minuteLabel && minuteLabel !== lastMinute) {
    lastMinute = minuteLabel;

    if (data.MQ7 !== undefined) pushPoint("mq7", minuteLabel, Number(data.MQ7));
    if (data.Dust !== undefined) pushPoint("dust", minuteLabel, Number(data.Dust));
    if (data.CO2 !== undefined) pushPoint("co2", minuteLabel, Number(data.CO2));
    if (data.TVOC !== undefined) pushPoint("tvoc", minuteLabel, Number(data.TVOC));

    if (chartSelector) {
      updateDisplayedChart(chartSelector.value);
    }
  }
}

function pushPoint(type, label, value) {
  const target = chartStore[type];
  if (!target) return;

  target.labels.push(label);
  target.values.push(value);

  if (target.labels.length > 20) {
    target.labels.shift();
    target.values.shift();
  }
}

function updateChartScale(chart, values) {
  if (!chart) return;

  if (!values || values.length === 0) {
    chart.options.scales.y.min = 0;
    chart.options.scales.y.max = 100;
    return;
  }

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  let padding = Math.max(3, Math.ceil((maxVal - minVal) * 0.3));
  if (minVal === maxVal) {
    padding = 10;
  }

  chart.options.scales.y.min = minVal - padding;
  chart.options.scales.y.max = maxVal + padding;
}

function updateValue(element, value, warn, danger) {
  if (!element) return;

  element.textContent = value;
  element.classList.remove("good", "normal", "bad");

  if (value < warn) {
    element.classList.add("good");
  } else if (value < danger) {
    element.classList.add("normal");
  } else {
    element.classList.add("bad");
  }
}

function downloadCSV(text, filename = "air_data.csv") {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function hideHistoryTable() {
  if (historyTable) historyTable.style.display = "none";
  if (historyTableHead) historyTableHead.innerHTML = "";
  if (historyTableBody) historyTableBody.innerHTML = "";
}

function renderHistoryTable(csvText) {
  if (!historyTable || !historyTableHead || !historyTableBody) return;

  const rows = csvText
    .split("\n")
    .map(row => row.trim())
    .filter(row => row.length > 0);

  if (rows.length === 0) {
    if (historyOutput) historyOutput.textContent = "查無資料";
    hideHistoryTable();
    return;
  }

  const headers = rows[0].split(",");
  const bodyRows = rows.slice(1).map(row => row.split(","));

  historyTableHead.innerHTML = `
    <tr>
      ${headers.map(h => `<th>${h}</th>`).join("")}
    </tr>
  `;

  historyTableBody.innerHTML = bodyRows
    .map(cols => `
      <tr>
        ${cols.map(col => `<td>${col}</td>`).join("")}
      </tr>
    `)
    .join("");

  if (historyOutput) historyOutput.textContent = "";
  historyTable.style.display = "table";
}

updateDisplayedChart("co2");
console.log("app.js loaded");
