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
        tension: 0.2
      }
    ]
  },
  options: {
    responsive: true,
    animation: false,
    scales: {
      y: {
        beginAtZero: true
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
  const readableClosed = port.readable.pipeTo(decoder.writable);
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

        // 只處理符合感測器格式的資料
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
  const timeMatch = line.match(/TIME=([^|]+)/);
  const mq7Match = line.match(/MQ7=(\d+)/);
  const dustMatch = line.match(/Dust=(\d+)/);
  const co2Match = line.match(/CO2=(\d+)/);
  const tvocMatch = line.match(/TVOC=(\d+)/);

  if (timeMatch) {
    timeValue.textContent = timeMatch[1].trim();
  }

  if (mq7Match) {
    mq7Value.textContent = mq7Match[1];
  }

  if (dustMatch) {
    dustValue.textContent = dustMatch[1];
  }

  if (co2Match) {
    const co2 = Number(co2Match[1]);
    co2Value.textContent = co2;

    const label = new Date().toLocaleTimeString();
    co2Labels.push(label);
    co2Data.push(co2);

    if (co2Labels.length > 20) {
      co2Labels.shift();
      co2Data.shift();
    }

    co2Chart.update();
  }

  if (tvocMatch) {
    tvocValue.textContent = tvocMatch[1];
  }
}
