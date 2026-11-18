// 零依赖折线图组件（canvas 2d）。data: [{ x: 标签, y: 数值 }]
// 支持触摸/划动：显示最近数据点的「标签 · 数值」浮标并高亮该点。
Component({
  properties: {
    data: { type: Array, value: [] },
    color: { type: String, value: "#2BB3A3" },
    height: { type: Number, value: 220 },
    unit: { type: String, value: "" },
    digits: { type: Number, value: 1 }
  },

  data: { tip: { show: false, left: 0, top: 0, text: "" } },

  observers: {
    "data, color": function () { this._active = null; this.setData({ "tip.show": false }); if (this._inited) this.draw(); }
  },

  lifetimes: {
    ready() { this._inited = true; this.init(); }
  },

  methods: {
    init() {
      const q = wx.createSelectorQuery().in(this);
      q.select("#c").fields({ node: true, size: true }).exec(res => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node, ctx = canvas.getContext("2d");
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
        canvas.width = res[0].width * dpr; canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        this._canvas = canvas; this._ctx = ctx; this._W = res[0].width; this._H = res[0].height;
        this.draw();
      });
    },

    fmt(v) {
      const d = this.data.digits;
      const n = Number(v);
      return (d >= 0 ? n.toFixed(d) : String(n)) + (this.data.unit || "");
    },

    geo() {
      const W = this._W, H = this._H, data = this.data.data || [];
      const PL = 46, PR = 16, PT = 18, PB = 30;
      const cw = W - PL - PR, ch = H - PT - PB;
      const ys = data.map(d => Number(d.y));
      let min = Math.min.apply(null, ys), max = Math.max.apply(null, ys);
      if (min === max) { min -= 1; max += 1; }
      const pad = (max - min) * 0.12; min -= pad; max += pad;
      const stepX = data.length > 1 ? cw / (data.length - 1) : 0;
      return { W, H, PL, PR, PT, PB, cw, ch, min, max, stepX };
    },
    pxX(g, i) { return g.PL + g.stepX * i; },
    pxY(g, v) { return g.PT + g.ch - ((Number(v) - g.min) / (g.max - g.min)) * g.ch; },

    draw() {
      const ctx = this._ctx; if (!ctx) { this.init(); return; }
      const data = this.data.data || [];
      const g = this.geo();
      ctx.clearRect(0, 0, g.W, g.H);

      if (data.length < 2) {
        ctx.fillStyle = "#8A94A6"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
        const msg = data.length === 0 ? "暂无数据" : "仅 1 个点：" + this.fmt(data[0].y) + "（至少 2 点可连线）";
        ctx.fillText(msg, g.W / 2, g.H / 2);
        return;
      }

      ctx.textBaseline = "middle"; ctx.font = "10px sans-serif";
      for (let k = 0; k <= 4; k++) {
        const v = g.min + (g.max - g.min) * k / 4, y = this.pxY(g, v);
        ctx.strokeStyle = "#ECEFF3"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(g.PL, y); ctx.lineTo(g.W - g.PR, y); ctx.stroke();
        ctx.fillStyle = "#8A94A6"; ctx.textAlign = "right";
        ctx.fillText(v.toFixed(this.data.digits >= 0 ? Math.max(0, this.data.digits - 1) : 1), g.PL - 8, y);
      }

      const color = this.data.color;
      ctx.beginPath(); ctx.moveTo(this.pxX(g, 0), this.pxY(g, data[0].y));
      data.forEach((d, i) => ctx.lineTo(this.pxX(g, i), this.pxY(g, d.y)));
      ctx.lineTo(this.pxX(g, data.length - 1), g.PT + g.ch); ctx.lineTo(this.pxX(g, 0), g.PT + g.ch); ctx.closePath();
      ctx.globalAlpha = 0.12; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;

      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round";
      data.forEach((d, i) => { const x = this.pxX(g, i), y = this.pxY(g, d.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();

      data.forEach((d, i) => {
        ctx.beginPath(); ctx.fillStyle = "#fff"; ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.arc(this.pxX(g, i), this.pxY(g, d.y), 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });

      // 高亮当前选中点
      if (this._active != null && data[this._active]) {
        const ax = this.pxX(g, this._active), ay = this.pxY(g, data[this._active].y);
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.moveTo(ax, g.PT); ctx.lineTo(ax, g.PT + g.ch); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.fillStyle = color; ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = "#8A94A6"; ctx.font = "10px sans-serif";
      const idxs = data.length <= 4 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1];
      const aligns = ["left", "center", "right"];
      idxs.forEach((id, k) => { ctx.textAlign = aligns[Math.min(k, 2)] || "center"; ctx.fillText(String(data[id].x), this.pxX(g, id), g.PT + g.ch + 14); });
    },

    onTouch(e) {
      const data = this.data.data || [];
      if (!this._ctx || data.length < 2) return;
      const g = this.geo();
      const px = (e.touches && e.touches[0]) ? e.touches[0].x : 0;
      let i = g.stepX > 0 ? Math.round((px - g.PL) / g.stepX) : 0;
      i = Math.max(0, Math.min(data.length - 1, i));
      this._active = i;
      const p = data[i];
      const left = Math.max(0, Math.min(g.W - 120, this.pxX(g, i) - 60));
      const top = Math.max(0, this.pxY(g, p.y) - 40);
      this.setData({ tip: { show: true, left, top, text: p.x + " · " + this.fmt(p.y) } });
      this.draw();
    }
  }
});
