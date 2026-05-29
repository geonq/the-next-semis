import { createChart, CandlestickSeries } from "lightweight-charts";

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const Chart = {
  mounted() {
    const history = JSON.parse(this.el.dataset.history || "[]");

    this.chart = createChart(this.el, {
      layout: {
        background: { color: cssVar("--color-bg") },
        textColor: cssVar("--color-neutral"),
      },
      grid: {
        vertLines: { color: cssVar("--color-grid") },
        horzLines: { color: cssVar("--color-grid") },
      },
      width: this.el.clientWidth,
      height: 400,
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: cssVar("--color-grid") },
    });

    const gain = cssVar("--color-gain");
    const loss = cssVar("--color-loss");

    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: gain,
      downColor: loss,
      borderUpColor: gain,
      borderDownColor: loss,
      wickUpColor: gain,
      wickDownColor: loss,
    });

    if (history.length > 0) {
      this.series.setData(history);
      this.chart.timeScale().fitContent();
    }

    this._ro = new ResizeObserver(() => {
      this.chart.applyOptions({ width: this.el.clientWidth });
    });
    this._ro.observe(this.el);

    this.handleEvent("chart-update", ({ candle }) => {
      this.series.update(candle);
    });
  },

  destroyed() {
    this._ro?.disconnect();
    this.chart?.remove();
  },
};

export default Chart;
