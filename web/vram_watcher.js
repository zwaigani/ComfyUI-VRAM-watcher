import { app } from "../../scripts/app.js";

const EXT_ID = "VRAM_watcher";
const API_URL = "/vram_watcher/status";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fmtMB(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rgb(r, g, b) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

// 0 -> green, 0.5 -> yellow, 1 -> red
function trafficColor01(p) {
  const t = clamp(p, 0, 1);

  const g = { r: 76, g: 175, b: 80 };
  const y = { r: 255, g: 235, b: 59 };
  const r = { r: 244, g: 67, b: 54 };

  if (t <= 0.5) {
    const k = t / 0.5;
    return rgb(lerp(g.r, y.r, k), lerp(g.g, y.g, k), lerp(g.b, y.b, k));
  }

  const k = (t - 0.5) / 0.5;
  return rgb(lerp(y.r, r.r, k), lerp(y.g, r.g, k), lerp(y.b, r.b, k));
}

app.registerExtension({
  name: EXT_ID,
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData?.name !== "VRAMWatcher") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);

      this.vramWatcher = {
        percent: 0,
        used_bytes: 0,
        total_bytes: 0,
        available: false,
        reason: "",
        ram_percent: 0,
        ram_used_bytes: 0,
        ram_total_bytes: 0,
        ram_available: false,
        ram_reason: "",
        lastUpdate: 0,
        inflight: false,
      };

      // Poll interval (seconds)
      this.properties = this.properties || {};
      if (typeof this.properties.vram_interval_s !== "number") {
        this.properties.vram_interval_s = 5;
      }

      // Display mode: percent or MB
      if (typeof this.properties.vram_display_mode !== "string") {
        this.properties.vram_display_mode = "%";
      }

      // Bar order: VRAM on top or RAM on top
      if (typeof this.properties.vram_bar_order !== "string") {
        this.properties.vram_bar_order = "VRAM→RAM";
      }

      // Widget to edit interval
      this.addWidget(
        "number",
        "Interval (s)",
        this.properties.vram_interval_s,
        (v) => {
          const n = Number(v);
          this.properties.vram_interval_s = Number.isFinite(n) ? n : 5;
        },
        { precision: 1, step: 0.5, min: 0.5 }
      );

      this.addWidget(
        "combo",
        "Display",
        this.properties.vram_display_mode,
        (v) => {
          this.properties.vram_display_mode = v;
        },
        { values: ["%", "MB"] }
      );

      this.addWidget(
        "combo",
        "Order",
        this.properties.vram_bar_order,
        (v) => {
          this.properties.vram_bar_order = v;
        },
        { values: ["VRAM→RAM", "RAM→VRAM"] }
      );

      // Make node tall enough for the bar
      this.size = this.size || [240, 150];
      this.size[1] = Math.max(this.size[1], 150);

      return r;
    };

    const onDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      onDrawForeground?.call(this, ctx);

      const w = this.size[0];
      const padding = 10;
      const barH = 14;
      const x = padding;
      const barW = w - padding * 2;
      const barGap = 28;
      const yRam = this.size[1] - padding - barH;
      const yVram = yRam - barGap;

      const drawBar = (y, percent01, label, fillAlpha = 1) => {
        // Border
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barW, barH);

        // Fill
        ctx.save();
        ctx.globalAlpha = fillAlpha;
        ctx.fillStyle = trafficColor01(percent01);
        ctx.fillRect(x + 1, y + 1, Math.max(0, (barW - 2) * clamp(percent01, 0, 1)), barH - 2);
        ctx.restore();

        // Text
        ctx.fillStyle = "#ddd";
        ctx.font = "12px sans-serif";
        ctx.fillText(label, x, y - 6);
      };

      // Background
      ctx.save();
      ctx.globalAlpha = 1;

      const s = this.vramWatcher;

      let vramLabel = "VRAM: ...";
      if (s?.available) {
        const mode = this?.properties?.vram_display_mode;
        if (mode === "MB") {
          vramLabel = `VRAM ${fmtMB(s.used_bytes)} / ${fmtMB(s.total_bytes)}`;
        } else {
          vramLabel = `VRAM ${s.percent.toFixed(1)}%`;
        }
      } else if (s?.reason) {
        vramLabel = `VRAM: unavailable (${s.reason})`;
      } else {
        vramLabel = "VRAM: unavailable";
      }

      let ramLabel = "RAM: ...";
      if (s?.ram_available) {
        const mode = this?.properties?.vram_display_mode;
        if (mode === "MB") {
          ramLabel = `RAM ${fmtMB(s.ram_used_bytes)} / ${fmtMB(s.ram_total_bytes)}`;
        } else {
          ramLabel = `RAM ${s.ram_percent.toFixed(1)}%`;
        }
      } else if (s?.ram_reason) {
        ramLabel = `RAM: unavailable (${s.ram_reason})`;
      } else {
        ramLabel = "RAM: unavailable";
      }

      const vramP = (s?.percent || 0) / 100;
      const ramP = (s?.ram_percent || 0) / 100;

      const order = this?.properties?.vram_bar_order;
      const topY = yVram;
      const bottomY = yRam;
      if (order === "RAM→VRAM") {
        drawBar(topY, ramP, ramLabel, 0.7);
        drawBar(bottomY, vramP, vramLabel, 1);
      } else {
        drawBar(topY, vramP, vramLabel, 1);
        drawBar(bottomY, ramP, ramLabel, 0.7);
      }

      ctx.restore();

      // Polling (throttled)
      const now = performance.now();
      const intervalSec = Number(this?.properties?.vram_interval_s);
      const intervalMs = Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec * 1000 : 5000;
      if (!this.vramWatcher) return;
      if (this.vramWatcher.inflight) return;
      if (now - this.vramWatcher.lastUpdate < intervalMs) return;

      this.vramWatcher.inflight = true;
      fetch(API_URL)
        .then((res) => res.json())
        .then((data) => {
          this.vramWatcher.available = !!data.available;
          this.vramWatcher.reason = data.reason || "";
          this.vramWatcher.percent = typeof data.percent === "number" ? data.percent : 0;
          this.vramWatcher.used_bytes = data.used_bytes || 0;
          this.vramWatcher.total_bytes = data.total_bytes || 0;

          this.vramWatcher.ram_available = !!data.ram_available;
          this.vramWatcher.ram_reason = data.ram_reason || "";
          this.vramWatcher.ram_percent = typeof data.ram_percent === "number" ? data.ram_percent : 0;
          this.vramWatcher.ram_used_bytes = data.ram_used_bytes || 0;
          this.vramWatcher.ram_total_bytes = data.ram_total_bytes || 0;
        })
        .catch((e) => {
          this.vramWatcher.available = false;
          this.vramWatcher.reason = String(e);
          this.vramWatcher.percent = 0;
          this.vramWatcher.used_bytes = 0;
          this.vramWatcher.total_bytes = 0;

          this.vramWatcher.ram_available = false;
          this.vramWatcher.ram_reason = String(e);
          this.vramWatcher.ram_percent = 0;
          this.vramWatcher.ram_used_bytes = 0;
          this.vramWatcher.ram_total_bytes = 0;
        })
        .finally(() => {
          this.vramWatcher.lastUpdate = performance.now();
          this.vramWatcher.inflight = false;
          this.setDirtyCanvas(true, true);
        });
    };
  },
});
