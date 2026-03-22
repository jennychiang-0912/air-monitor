<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>即時空氣品質監測系統</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "Microsoft JhengHei", sans-serif;
      background: #f3f6fb;
      color: #1f2d3d;
    }

    .container {
      max-width: 1450px;
      margin: 0 auto;
      padding: 24px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 48px;
      font-weight: 800;
      color: #14294b;
    }

    .subtitle {
      font-size: 20px;
      color: #607089;
      margin-bottom: 28px;
    }

    .top-bar {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 28px;
    }

    #connectBtn {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 14px;
      padding: 14px 24px;
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
    }

    #status {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 22px;
      margin-bottom: 28px;
    }

    .card {
      background: #fff;
      border-radius: 22px;
      padding: 24px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.06);
      min-height: 150px;
    }

    .card h3 {
      margin: 0 0 6px;
      font-size: 26px;
      color: #13294b;
    }

    .card p {
      margin: 0 0 24px;
      color: #6b7280;
      font-size: 16px;
      line-height: 1.4;
    }

    .value {
      font-size: 38px;
      font-weight: 800;
      color: #13294b;
    }

    .section {
      background: #fff;
      border-radius: 24px;
      padding: 26px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.06);
      margin-bottom: 28px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }

    .section-title {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
      color: #13294b;
    }

    .section-subtitle {
      margin-top: 6px;
      font-size: 16px;
      color: #6b7280;
    }

    .selector-box label {
      display: block;
      margin-bottom: 8px;
      font-size: 16px;
      font-weight: 700;
      color: #4b5563;
    }

    #chartSelector {
      width: 260px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid #d1d5db;
      font-size: 16px;
      background: #fff;
    }

    .raw-box {
      background: #071633;
      color: #dbeafe;
      border-radius: 18px;
      padding: 18px;
      font-size: 20px;
      font-weight: 600;
      min-height: 64px;
      white-space: nowrap;
      overflow-x: auto;
    }

    .chart-wrap {
      position: relative;
      height: 360px;
    }

    .good { color: #15803d; }
    .normal { color: #d97706; }
    .bad { color: #dc2626; }

    @media (max-width: 1200px) {
      .card-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 700px) {
      .card-grid {
        grid-template-columns: 1fr;
      }

      h1 {
        font-size: 34px;
      }

      .chart-wrap {
        height: 280px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>即時空氣品質監測系統</h1>
    <div class="subtitle">Arduino + Web Serial 即時監測</div>

    <div class="top-bar">
      <button id="connectBtn">連接 Arduino</button>
      <div id="status">尚未連接</div>
    </div>

    <div class="card-grid">
      <div class="card">
        <h3>時間</h3>
        <p>RTC 即時時間</p>
        <div class="value" id="timeValue">--</div>
      </div>

      <div class="card">
        <h3>一氧化碳（CO）</h3>
        <p>由 MQ-7 感測器測得</p>
        <div class="value" id="mq7Value">--</div>
      </div>

      <div class="card">
        <h3>粉塵濃度</h3>
        <p>空氣中懸浮粒子變化</p>
        <div class="value" id="dustValue">--</div>
      </div>

      <div class="card">
        <h3>二氧化碳（CO₂）</h3>
        <p>由 CCS811 感測器測得</p>
        <div class="value" id="co2Value">--</div>
      </div>

      <div class="card">
        <h3>揮發性有機物（TVOC）</h3>
        <p>空氣中氣體污染程度</p>
        <div class="value" id="tvocValue">--</div>
      </div>
    </div>

    <!-- 圖表區 -->
    <div class="section">
      <div class="section-header">
        <div>
          <h2 class="section-title" id="chartTitle">二氧化碳（CO₂）每分鐘變化</h2>
          <div class="section-subtitle">每分鐘記錄一個點</div>
        </div>

        <div class="selector-box">
          <label for="chartSelector">選擇圖表</label>
          <select id="chartSelector">
            <option value="co2">二氧化碳（CO₂）</option>
            <option value="mq7">一氧化碳（CO）</option>
            <option value="dust">粉塵濃度</option>
            <option value="tvoc">揮發性有機物（TVOC）</option>
          </select>
        </div>
      </div>

      <div class="chart-wrap">
        <canvas id="mainChart"></canvas>
      </div>
    </div>

    <!-- 原始資料區：移到最下面 -->
    <div class="section">
      <h2 class="section-title">最近收到的原始資料</h2>
      <div class="raw-box" id="rawData">等待資料中...</div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
