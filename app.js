let chart, hourChart;
const MAX_POINTS = 20;

let rawCsv = "time,mq7,dust,co2,tvoc,aqi\n";

const chartStore = {
  mq7: { labels: [], values: [] },
  dust: { labels: [], values: [] },
  co2: { labels: [], values: [] },
  tvoc: { labels: [], values: [] },
  aqi: { labels: [], values: [] }
};

const hourlyChartStore = JSON.parse(JSON.stringify(chartStore));

function pm25ToAQI(pm25) {
  const bp = [
    [0, 15.4, 0, 50],
    [15.5, 35.4, 51, 100],
    [35.5, 54.4, 101, 150],
    [54.5, 150.4, 151, 200]
  ];

  for (let [cL, cH, iL, iH] of bp) {
    if (pm25 >= cL && pm25 <= cH) {
      return Math.round(((iH - iL)/(cH - cL))*(pm25 - cL)+iL);
    }
  }
  return 200;
}

function calcAQI(dust){
  if(!dust) return null;
  return pm25ToAQI(dust*0.1);
}

function addDataRow(data){

  const now = new Date();
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`;

  const aqi = calcAQI(data.dust);

  document.getElementById("aqiValue").textContent = aqi ?? "--";

  const row = `${time},${data.mq7},${data.dust},${data.co2},${data.tvoc},${aqi}`;
  rawCsv += row + "\n";

  updateMinuteChart(data, aqi);
  updateHourChart(data, aqi);
}

function updateMinuteChart(data, aqi){

  const label = new Date().getMinutes();

  pushData(chartStore.mq7, label, data.mq7);
  pushData(chartStore.dust, label, data.dust);
  pushData(chartStore.co2, label, data.co2);
  pushData(chartStore.tvoc, label, data.tvoc);
  pushData(chartStore.aqi, label, aqi);

  drawChart();
}

function updateHourChart(data, aqi){

  const hour = new Date().getHours();

  pushData(hourlyChartStore.mq7, hour, data.mq7);
  pushData(hourlyChartStore.dust, hour, data.dust);
  pushData(hourlyChartStore.co2, hour, data.co2);
  pushData(hourlyChartStore.tvoc, hour, data.tvoc);
  pushData(hourlyChartStore.aqi, hour, aqi);

  drawHourChart();
}

function pushData(store,label,val){
  store.labels.push(label);
  store.values.push(val);

  if(store.labels.length>MAX_POINTS){
    store.labels.shift();
    store.values.shift();
  }
}

function drawChart(){

  const type = document.getElementById("chartSelector").value;
  const s = chartStore[type];

  if(!chart){
    chart = new Chart(document.getElementById("mainChart"),{
      type:"line",
      data:{labels:s.labels,datasets:[{data:s.values}]}
    });
  }else{
    chart.data.labels=s.labels;
    chart.data.datasets[0].data=s.values;
    chart.update();
  }
}

function drawHourChart(){

  const type = document.getElementById("hourChartSelector").value;
  const s = hourlyChartStore[type];

  if(!hourChart){
    hourChart = new Chart(document.getElementById("hourChart"),{
      type:"line",
      data:{labels:s.labels,datasets:[{data:s.values}]}
    });
  }else{
    hourChart.data.labels=s.labels;
    hourChart.data.datasets[0].data=s.values;
    hourChart.update();
  }
}
