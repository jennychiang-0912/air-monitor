function parseTimeToTimestamp(timeStr) {
  if (!timeStr) return NaN;

  const clean = String(timeStr).trim();
  const m = clean.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
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

function toNumberOrNull(value) {
  if (value == null) return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function initChart(csv) {
  try {
    if (
      !chartStore ||
      !chartStore.mq7 ||
      !chartStore.dust ||
      !chartStore.co2 ||
      !chartStore.tvoc
    ) {
      console.error("chartStore 尚未正確初始化");
      return;
    }

    clearAllChartData();

    if (!csv || !String(csv).trim()) {
      padChartTo20();
      if (chartSelector) updateChart(chartSelector.value);
      return;
    }

    let rows = String(csv)
      .replace(/\r/g, "")
      .trim()
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => r);

    if (rows.length <= 1) {
      padChartTo20();
      if (chartSelector) updateChart(chartSelector.value);
      return;
    }

    rows = rows.slice(1);

    const parsed = rows
      .map((r) => {
        const cols = r.split(",").map((c) => c.trim());
        if (cols.length < 5) return null;

        const [time, mq7, dust, co2, tvoc] = cols;
        const ts = parseTimeToTimestamp(time);

        if (isNaN(ts)) return null;

        return {
          time,
          mq7: toNumberOrNull(mq7),
          dust: toNumberOrNull(dust),
          co2: toNumberOrNull(co2),
          tvoc: toNumberOrNull(tvoc),
          ts
        };
      })
      .filter(Boolean);

    parsed.sort((a, b) => a.ts - b.ts);

    const lastRows = parsed.slice(-MAX_POINTS);

    lastRows.forEach((row) => {
      const label =
        typeof extractMinuteLabel === "function"
          ? (extractMinuteLabel(row.time) || "")
          : row.time;

      chartStore.mq7.labels.push(label);
      chartStore.mq7.values.push(row.mq7);

      chartStore.dust.labels.push(label);
      chartStore.dust.values.push(row.dust);

      chartStore.co2.labels.push(label);
      chartStore.co2.values.push(row.co2);

      chartStore.tvoc.labels.push(label);
      chartStore.tvoc.values.push(row.tvoc);
    });

    padChartTo20();

    const nonEmpty = (chartStore.co2.labels || []).filter((x) => x !== "");
    lastMinute = nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : null;

    if (chartSelector) {
      updateChart(chartSelector.value);
    } else {
      console.warn("chartSelector 不存在，略過 updateChart");
    }
  } catch (err) {
    console.error("initChart 發生錯誤：", err);
  }
}
