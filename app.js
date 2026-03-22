const connectBtn = document.getElementById("connectBtn");
const statusText = document.getElementById("status");
const rawData = document.getElementById("rawData");

const timeValue = document.getElementById("timeValue");
const mq7Value = document.getElementById("mq7Value");
const dustValue = document.getElementById("dustValue");
const co2Value = document.getElementById("co2Value");
const tvocValue = document.getElementById("tvocValue");

let port = null;
let reader = null;

const co2Labels = [];
const co2Data = [];

const ctx = document.getElementById("co2Chart").getContext("2d");
const co2Chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: co2Labels,
    datasets: [
      {
        label: "CO2",
        data: co2Data,
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 3
      }
    ]
  },
  options: {
    responsive: true,
    animation: false,
    scales: {
      y: {
        beginAtZero: false
      }
    }
  }
});

connectBtn.addEventListener("click", async () => {
  try {
    if (!("serial" in navigator)) {
      statusText.textContent = "此瀏覽器不支援 Web Serial";
      rawData.textContent = "請改用 Chrome 或 Edge 開啟網站";
      return;
    }

    statusText.textContent = "請選擇 Arduino 連接埠...";
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    statusText.textContent = "已連接 Arduino";
    rawData.textContent = "連接成功，等待資料中...";

    await readSerial();
  } catch (error) {
    statusText.textContent = "連接失敗";
    rawData.textContent = `錯誤：${error.name} - ${error.message}`;
    console.error(error);
  }
});

async function readSerial() {
  const decoder = new TextDecoderStream();
  port.readable.pipeTo(decoder.writable);
  reader = decoder.readable.getReader();

  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        rawData.textContent = cleanLine;

        if (cleanLine.includes("TIME=") && cleanLine.includes("MQ7=")) {
          parseData(cleanLine);
        }
      }
    }
  } catch (error) {
    rawData.textContent = `讀取錯誤：${error.name} - ${error.message}`;
    console.error(error);
  } finally {
    if (reader) {
      reader.releaseLock();
    }
  }
}

function parseData(line) {
  const parts = line.split("|").map(item => item.trim());
  let parsed = {};

  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex > -1) {
      const key = part.substring(0, eqIndex).trim();
      const value = part.substring(eqIndex + 1).trim();
      parsed[key] = value;
    }
  }

  if (parsed["TIME"]) {
    timeValue.textContent = parsed["TIME"];
  }

  if (parsed["MQ7"]) {
    mq7Value.textContent = parsed["MQ7"];
  }

  if (parsed["Dust"]) {
    dustValue.textContent = parsed["Dust"];
  }

  if (parsed["CO2"]) {
    const co2 = Number(parsed["CO2"]);
    co2Value.textContent = co2;

    const label = parsed["TIME"] ? parsed["TIME"].split(" ")[1] : new Date().toLocaleTimeString();
    co2Labels.push(label);
    co2Data.push(co2);

    if (co2Labels.length > 20) {
      co2Labels.shift();
      co2Data.shift();
    }

    updateChartScale();
    co2Chart.update();
  }

  if (parsed["TVOC"]) {
    tvocValue.textContent = parsed["TVOC"];
  }
}

function updateChartScale() {
  if (co2Data.length === 0) return;

  const minVal = Math.min(...co2Data);
  const maxVal = Math.max(...co2Data);

  let padding = Math.max(5, Math.ceil((maxVal - minVal) * 0.2));

  if (minVal === maxVal) {
    padding = 10;
  }

  co2Chart.options.scales.y.min = minVal - padding;
  co2Chart.options.scales.y.max = maxVal + padding;
}
