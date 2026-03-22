const connectBtn = document.getElementById("connectBtn");
const statusText = document.getElementById("status");
const output = document.getElementById("output");

const queryBtn = document.getElementById("queryBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");

const startInput = document.getElementById("startTime");
const endInput = document.getElementById("endTime");

let port;
let reader;

let csvBuffer = "";
let isCSV = false;
let shouldDownload = false;

// ===== 連接 Arduino =====
connectBtn.onclick = async () => {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    statusText.textContent = "已連接 Arduino";

    readSerial();
  } catch (err) {
    statusText.textContent = "連接失敗";
    console.error(err);
  }
};

// ===== 發送指令 =====
async function sendCommand(cmd) {
  if (!port) {
    alert("請先連接 Arduino");
    return;
  }

  const encoder = new TextEncoder();
  const writer = port.writable.getWriter();
  await writer.write(encoder.encode(cmd + "\n"));
  writer.releaseLock();
}

// ===== 讀 Serial =====
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

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // ===== CSV 開始 =====
      if (line === "CSV_BEGIN") {
        isCSV = true;
        csvBuffer = "";
        output.textContent = "接收資料中...";
        continue;
      }

      // ===== CSV 結束 =====
      if (line === "CSV_END") {
        isCSV = false;

        output.textContent = csvBuffer || "查無資料";

        if (shouldDownload && csvBuffer.trim()) {
          downloadCSV(csvBuffer);
          shouldDownload = false;
        }
        continue;
      }

      // ===== CSV內容 =====
      if (isCSV) {
        csvBuffer += line + "\n";
        continue;
      }
    }
  }
}

// ===== 查詢 =====
queryBtn.onclick = async () => {
  const start = startInput.value.trim();
  const end = endInput.value.trim();

  if (!start || !end) {
    alert("請輸入時間");
    return;
  }

  output.textContent = "查詢中...";
  await sendCommand(`QUERY,${start},${end}`);
};

// ===== 匯出 =====
exportBtn.onclick = async () => {
  output.textContent = "匯出中...";
  shouldDownload = true;
  await sendCommand("EXPORT");
};

// ===== 清除 =====
clearBtn.onclick = async () => {
  if (!confirm("確定清除 EEPROM 資料？")) return;

  await sendCommand("CLEAR");
  output.textContent = "已清除";
};

// ===== 下載 CSV =====
function downloadCSV(text) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "air_data.csv";
  a.click();

  URL.revokeObjectURL(url);
}
