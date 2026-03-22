const connectBtn = document.getElementById("connectBtn");
const statusText = document.getElementById("status");
const rawData = document.getElementById("rawData");

const mq7Value = document.getElementById("mq7Value");
const dustValue = document.getElementById("dustValue");
const co2Value = document.getElementById("co2Value");
const tvocValue = document.getElementById("tvocValue");

let port;
let reader;

const co2Labels = [];
const co2Data = [];

const ctx = document.getElementById("co2Chart").getContext("2d");
const co2Chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: co2Labels,
    datasets: [{
      label: "CO2",
      data: co2Data,
      tension: 0.2
    }]
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
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    statusText.textContent = "已連接 Arduino";
    readSerial();
  } catch (error) {
    statusText.textContent = "連接失敗";
    rawData.textContent = error.message;
  }
});

async function readSerial() {
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

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

      rawData.textContent = cleanLine;
      parseData(cleanLine);
    }
  }
}

function parseData(line) {
  // 預期格式：
  // MQ7=100 | Dust=200 | CO2=400 | TVOC=10
  const mq7Match = line.match(/MQ7=(\d+)/);
  const dustMatch = line.match(/Dust=(\d+)/);
  const co2Match = line.match(/CO2=(\d+)/);
  const tvocMatch = line.match(/TVOC=(\d+)/);

  if (mq7Match) mq7Value.textContent = mq7Match[1];
  if (dustMatch) dustValue.textContent = dustMatch[1];
  if (co2Match) {
    const co2 = Number(co2Match[1]);
    co2Value.textContent = co2;

    const now = new Date();
    const label = now.toLocaleTimeString();

    co2Labels.push(label);
    co2Data.push(co2);

    if (co2Labels.length > 20) {
      co2Labels.shift();
      co2Data.shift();
    }

    co2Chart.update();
  }
  if (tvocMatch) tvocValue.textContent = tvocMatch[1];
}
