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

let port = null;
let reader = null;
let lastMinute = null;

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

const ctx = document.getElementById("mainChart").getContext("2d");
const mainChart = new Chart(ctx, {
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

chartSelector.addEventListener("change", () => {
  updateDisplayedChart(chartSelector.value);
});

function updateDisplayedChart(type) {
  const selected = chartStore[type];

  chartTitle.textContent = selected.title;
  mainChart.data.labels = selected.labels;
  mainChart.data.datasets[0].label = selected.label;
  mainChart.data.datasets[0].data = selected.values;

  updateChartScale(mainChart, selected.values);
  mainChart.update();
}

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

function parse(line) {
  const parts = line.split("|").map(x => x.trim());
  let data = {};

  parts.forEach(part => {
    const eqIndex = part.indexOf("=");
    if (eqIndex !== -1) {
      const key = part.substring(0, eqIndex).trim();
      const value = part.substring(eqIndex + 1).trim();
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

  if (data.TIME) {
    const match = data.TIME.match(/(\d{2}:\d{2}):\d{2}/);
    const minuteLabel = match ? match[1] : null;

    if (minuteLabel && minuteLabel !== lastMinute) {
      lastMinute = minuteLabel;

      if (data.MQ7) {
        pushPoint("mq7", minuteLabel, Number(data.MQ7));
      }

      if (data.Dust) {
        pushPoint("dust", minuteLabel, Number(data.Dust));
      }

      if (data.CO2) {
        pushPoint("co2", minuteLabel, Number(data.CO2));
      }

      if (data.TVOC) {
        pushPoint("tvoc", minuteLabel, Number(data.TVOC));
      }

      updateDisplayedChart(chartSelector.value);
    }
  }
}

function pushPoint(type, label, value) {
  const target = chartStore[type];
  target.labels.push(label);
  target.values.push(value);

  if (target.labels.length > 20) {
    target.labels.shift();
    target.values.shift();
  }
}

function updateChartScale(chart, values) {
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
