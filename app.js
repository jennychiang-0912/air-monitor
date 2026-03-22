function parse(line) {
  const parts = line.split("|").map(x => x.trim());
  const data = {};

  parts.forEach(part => {
    const eqIndex = part.indexOf("=");
    if (eqIndex !== -1) {
      const key = part.substring(0, eqIndex).trim();
      const value = part.substring(eqIndex + 1).trim();
      data[key] = value;
    }
  });

  // 允許兩種即時格式：
  // 1. TYPE=LIVE | TIME=...
  // 2. TIME=...
  if (data.TYPE && data.TYPE !== "LIVE") return;
  if (!data.TIME) return;

  if (timeValue) {
    timeValue.textContent = data.TIME;
  }

  if (data.MQ7 && mq7Value) {
    updateValue(mq7Value, Number(data.MQ7), 200, 400);
  }

  if (data.Dust && dustValue) {
    updateValue(dustValue, Number(data.Dust), 300, 600);
  }

  if (data.CO2 && co2Value) {
    updateValue(co2Value, Number(data.CO2), 800, 1200);
  }

  if (data.TVOC && tvocValue) {
    updateValue(tvocValue, Number(data.TVOC), 200, 400);
  }

  const match = data.TIME.match(/(\d{2}:\d{2}):\d{2}/);
  const minuteLabel = match ? match[1] : null;

  if (minuteLabel && minuteLabel !== lastMinute) {
    lastMinute = minuteLabel;

    if (data.MQ7) pushPoint("mq7", minuteLabel, Number(data.MQ7));
    if (data.Dust) pushPoint("dust", minuteLabel, Number(data.Dust));
    if (data.CO2) pushPoint("co2", minuteLabel, Number(data.CO2));
    if (data.TVOC) pushPoint("tvoc", minuteLabel, Number(data.TVOC));

    if (chartSelector) {
      updateDisplayedChart(chartSelector.value);
    }
  }
}
