const connectBtn = document.getElementById("connectBtn");
const statusText = document.getElementById("status");
const rawData = document.getElementById("rawData");

const timeValue = document.getElementById("timeValue");
const mq7Value = document.getElementById("mq7Value");
const dustValue = document.getElementById("dustValue");
const co2Value = document.getElementById("co2Value");
const tvocValue = document.getElementById("tvocValue");

let port, reader;
let lastMinute = null;

// ===== 各圖表資料 =====
const mq7Labels = [];
const mq7Data = [];

const dustLabels = [];
const dustData = [];

const co2Labels = [];
const co2Data = [];

const tvocLabels = [];
const tvocData = [];

// ===== 建立圖表 =====
const mq7Chart = new Chart(document.getElementById("mq7Chart").getContext("2d"), {
  type: "line",
  data: {
    labels: mq7Labels,
    datasets: [{
      label: "CO",
      data: mq7Data,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 3
    }]
  },
  options: {
    responsive: true,
    animation: false,
    scales: { y: { beginAtZero: false } }
  }
});

const dustChart = new Chart(document.getElementById("dustChart").getContext("2d"), {
  type: "line",
  data: {
    labels: dustLabels,
    datasets: [{
      label: "Dust",
      data: dustData,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 3
    }]
  },
  options: {
    responsive: true,
    animation: false,
    scales: { y: { beginAtZero: false } }
  }
});

const co2Chart = new Chart(document.getElementById("co2Chart").getContext("2d"), {
  type: "line",
  data: {
    labels: co2Labels,
    datasets: [{
      label: "CO2",
      data: co2Data,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 3
    }]
  },
  options: {
    responsive: true,
    animation: false,
    scales: { y: { beginAtZero: false } }
  }
});

const tvocChart = new Chart(document.getElementById("tvocChart").getContext("2d"), {
  type: "line",
  data: {
    labels: tvocLabels,
    datasets: [{
      label: "TVOC",
      data: tvocData,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 3
    }]
  },
  options: {
    responsive: true,
    animation: false,
    scales: { y: { beginAtZero: false } }
  }
});

// ===== 連接 Arduino =====
connectBtn.onclick = async () => {
  try {
    if (!("serial" in navigator)) {
      statusText.textContent = "此瀏覽器不支援 Web Serial";
      rawData.textContent = "請改用 Chrome 或 Edge";
      return;
    }

    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    statusText.textContent = "已連接 Arduino";

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

        rawData.textContent = line;
        parse(line);
      }
    }
  } catch (error) {
    statusText.textContent = "連接失敗";
    rawData.textContent = `錯誤：${error.name} - ${error.message}`;
    console.error(error);
  }
};

// ===== 解析資料 =====
function parse(line) {
  const parts = line.split("|").map(x => x.trim());
  let data = {};

  parts.forEach(p => {
    const eqIndex = p.indexOf("=");
    if (eqIndex !== -1) {
      const key = p.substring(0, eqIndex).trim();
      const value = p.substring(eqIndex + 1).trim();
      data[key] = value;
    }
  });

  if (data.TIME) {
    timeValue.textContent = data.TIME;
  }

  if (data.MQ7) {
    updateValue(mq7Value, Number(data.MQ7), 200, 400);
  }

  if (data.Dust) {
    updateValue(dustValue, Number(data.Dust), 300, 600);
  }

  if (data.CO2) {
    updateValue(co2Value, Number(data.CO2), 800, 1200);
  }

  if (data.TVOC) {
    updateValue(tvocValue, Number(data.TVOC), 200, 400);
  }

  // ===== 每分鐘只加一個點 =====
  if (data.TIME) {
    const timeParts = data.TIME.split(" ");
    const minuteLabel = timeParts.length > 1 ? timeParts[1].slice(0, 5) : null;

    if (minuteLabel && minuteLabel !== lastMinute) {
      lastMinute = minuteLabel;

      if (data.MQ7) {
        pushChartPoint(mq7Labels, mq7Data, minuteLabel, Number(data.MQ7), mq7Chart);
      }

      if (data.Dust) {
        pushChartPoint(dustLabels, dustData, minuteLabel, Number(data.Dust), dustChart);
      }

      if (data.CO2) {
        pushChartPoint(co2Labels, co2Data, minuteLabel, Number(data.CO2), co2Chart);
      }

      if (data.TVOC) {
        pushChartPoint(tvocLabels, tvocData, minuteLabel, Number(data.TVOC), tvocChart);
      }
    }
  }
}

// ===== 推入圖表點 =====
function pushChartPoint(labels, values, label, value, chart) {
  labels.push(label);
  values.push(value);

  if (labels.length > 20) {
    labels.shift();
    values.shift();
  }

  updateChartScale(chart, values);
  chart.update();
}

// ===== 自動調整圖表刻度 =====
function updateChartScale(chart, values) {
  if (values.length === 0) return;

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  let padding = Math.max(3, Math.ceil((maxVal - minVal) * 0.3));

  if (minVal === maxVal) {
    padding = 10;
  }

  chart.options.scales.y.min = minVal - padding;
  chart.options.scales.y.max = maxVal + padding;
}

// ===== 更新數值顏色 =====
function updateValue(element, value, warn, danger) {
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
