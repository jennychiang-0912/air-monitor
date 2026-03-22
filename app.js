function parseTimeToTimestamp(timeStr) {
  if (!timeStr) return NaN;

  const m = timeStr.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return NaN;

  const [, y, mo, d, h, mi] = m;

  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    0
  ).getTime();
}

function initChart(csv) {
  clearAllChartData();

  if (!csv || !csv.trim()) {
    padChartTo20();
    updateChart(chartSelector.value);
    return;
  }

  let rows = csv
    .trim()
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r);

  if (rows.length <= 1) {
    padChartTo20();
    updateChart(chartSelector.value);
    return;
  }

  rows = rows.slice(1);

  // ⭐ 這裡是關鍵：轉成物件 + timestamp
  const parsed = rows
    .map((r) => {
      const cols = r.split(",");
      if (cols.length < 5) return null;

      const [time, mq7, dust, co2, tvoc] = cols;

      return {
        time,
        mq7,
        dust,
        co2,
        tvoc,
        ts: parseTimeToTimestamp(time)
      };
    })
    .filter((x) => x && !isNaN(x.ts));

  // ⭐ 真正照時間排序（舊 → 新）
  parsed.sort((a, b) => a.ts - b.ts);

  // ⭐ 只取最後 20 筆（最新在右邊）
  const lastRows = parsed.slice(-MAX_POINTS);

  lastRows.forEach((row) => {
    const label = extractMinuteLabel(row.time);

    chartStore.mq7.labels.push(label);
    chartStore.mq7.values.push(toNumberOrNull(row.mq7));

    chartStore.dust.labels.push(label);
    chartStore.dust.values.push(toNumberOrNull(row.dust));

    chartStore.co2.labels.push(label);
    chartStore.co2.values.push(toNumberOrNull(row.co2));

    chartStore.tvoc.labels.push(label);
    chartStore.tvoc.values.push(toNumberOrNull(row.tvoc));
  });

  padChartTo20();

  const nonEmpty = chartStore.co2.labels.filter((x) => x !== "");
  lastMinute = nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : null;

  updateChart(chartSelector.value);
}
