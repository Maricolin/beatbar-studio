// Viewport-sized timeline: zoom never allocates a duration-sized bitmap.
import { beatColor } from "./visuals.js";
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const timeToX = (time, duration, width) =>
  18 + (time / Math.max(0.001, duration)) * Math.max(1, width - 36);
export const xToTime = (x, duration, width) =>
  clamp(((x - 18) / Math.max(1, width - 36)) * duration, 0, duration);
export function createTimeline(o) {
  const { canvas, scroll } = o;
  let scale = 1,
    snap = false,
    follow = true,
    gesture = null,
    scrollFrame = 0;
  const spacer = document.createElement("div");
  spacer.className = "timeline-content";
  scroll.append(spacer);
  spacer.append(canvas);
  canvas.style.position = "sticky";
  canvas.style.left = "0";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  const viewport = () => Math.max(40, scroll.clientWidth);
  const total = () => viewport() * scale;
  const tx = (t) => timeToX(t, o.getDuration(), total());
  const timeAt = (x) =>
    xToTime(x + scroll.scrollLeft, o.getDuration(), total());
  const localX = (e) => e.clientX - scroll.getBoundingClientRect().left;
  const sorted = () => {
    const beats = o.getBeats();
    const selected = gesture?.beat;
    beats.sort((a, b) => a.time - b.time);
    if (selected) o.setSelected(beats.indexOf(selected));
    o.updateSelection();
  };
  function snapped(t, e) {
    if (snap && !e.altKey) {
      const grid = 60 / Math.max(20, o.getBpm()) / 4;
      const nearest = Math.round(t / grid) * grid;
      // Snap only within 10 visible pixels, including at high zoom.
      if (Math.abs(tx(t) - tx(nearest)) < 10) t = nearest;
    }
    return Math.round(clamp(t, 0, o.getDuration()) * 1000) / 1000;
  }
  function draw() {
    const w = viewport(),
      h = 170,
      dpr = Math.min(devicePixelRatio || 1, 2);
    spacer.style.width = total() + "px";
    if (follow && !gesture && o.isPlaying?.()) {
      const x = tx(o.getTime()) - scroll.scrollLeft;
      if (x > w * 0.9 || x < 0)
        scroll.scrollLeft = Math.max(0, tx(o.getTime()) - w * 0.2);
    }
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== h * dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#15191d";
    ctx.fillRect(0, 0, w, h);
    const start = timeAt(0),
      end = timeAt(w);
    const desired = (end - start) / Math.max(2, w / 95);
    const steps = [
      0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600,
      1200,
    ];
    const step = steps.find((s) => s >= desired) || 1200;
    ctx.font = "10px monospace";
    ctx.lineWidth = 1;
    for (let t = Math.ceil(start / step) * step; t <= end + step; t += step) {
      const x = tx(t) - scroll.scrollLeft;
      ctx.strokeStyle = "#2a3138";
      ctx.beginPath();
      ctx.moveTo(x, 29);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = "#8a98a3";
      ctx.fillText(
        o.formatTime(t).slice(0, step < 1 ? undefined : -4),
        x + 3,
        17,
      );
    }
    const wave = o.getWaveform();
    ctx.fillStyle = "#44594c";
    for (let x = 0; x < w; x += 2) {
      const t = timeAt(x),
        i = Math.min(
          wave.length - 1,
          Math.floor((t / o.getDuration()) * wave.length),
        );
      const amp = Math.max(1, (Number(wave[i]) || 0) * 43);
      ctx.fillRect(x, 97 - amp, 1.5, amp * 2);
    }
    const beats = o.getBeats(),
      style = o.getStyle();
    // Binary search to avoid walking 100,000 offscreen beats on every paint.
    let lo = 0,
      hi = beats.length;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (beats[m].time < start - 0.01) lo = m + 1;
      else hi = m;
    }
    for (let i = lo; i < beats.length && beats[i].time <= end + 0.01; i++) {
      const b = beats[i],
        x = tx(b.time) - scroll.scrollLeft;
      ctx.strokeStyle =
        i === o.getSelected()
          ? "#ffffff"
          : beatColor(style, i, b.strength, 0, b.loudnessDb);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = i === o.getSelected() ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 42);
      ctx.lineTo(x, 151);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, 34);
      ctx.lineTo(x + 5, 40);
      ctx.lineTo(x, 46);
      ctx.lineTo(x - 5, 40);
      ctx.closePath();
      ctx.fill();
    }
    const x = tx(o.getTime()) - scroll.scrollLeft;
    ctx.strokeStyle = ctx.fillStyle = "#e1e9ee";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6, 22);
    ctx.lineTo(x + 6, 22);
    ctx.lineTo(x, 31);
    ctx.closePath();
    ctx.fill();
    canvas.setAttribute("aria-valuenow", o.getTime().toFixed(3));
    canvas.setAttribute("aria-valuemax", String(o.getDuration()));
    canvas.setAttribute("aria-valuetext", o.formatTime(o.getTime()));
  }
  function zoom(value, clientX) {
    const x =
      clientX === undefined
        ? viewport() / 2
        : clamp(clientX - scroll.getBoundingClientRect().left, 0, viewport());
    const t = timeAt(x);
    scale = clamp(
      value,
      1,
      Math.max(16, Math.min(1024, (o.getDuration() * 120) / viewport())),
    );
    spacer.style.width = total() + "px";
    scroll.scrollLeft = Math.max(0, tx(t) - x);
    o.onZoom(scale);
    draw();
  }
  function updateGesture(e) {
    if (!gesture) return;
    const x = localX(e);
    gesture.lastEvent = { clientX: e.clientX, altKey: e.altKey };
    if (gesture.kind === "pan") {
      scroll.scrollLeft = gesture.left + gesture.startClientX - e.clientX;
      draw();
      return;
    }
    if (gesture.kind === "scrub") {
      o.seek(timeAt(x));
      draw();
      return;
    }
    if (!gesture.changed && Math.abs(e.clientX - gesture.startClientX) < 3)
      return;
    if (!gesture.changed) {
      o.checkpoint();
      gesture.changed = true;
    }
    gesture.beat.time = snapped(timeAt(x), e);
    sorted();
    draw();
  }
  function edgeScroll() {
    if (!gesture || gesture.kind === "pan") return;
    const e = gesture.lastEvent;
    if (e) {
      const x = localX(e),
        w = viewport();
      const delta = x < 24 ? -12 : x > w - 24 ? 12 : 0;
      if (delta) {
        scroll.scrollLeft += delta;
        updateGesture(e);
      }
    }
    scrollFrame = requestAnimationFrame(edgeScroll);
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!o.hasMedia() || (e.button !== 0 && e.button !== 1)) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    const x = localX(e),
      y = e.clientY - canvas.getBoundingClientRect().top;
    if (e.button === 1)
      gesture = {
        kind: "pan",
        left: scroll.scrollLeft,
        startClientX: e.clientX,
      };
    else {
      let nearest = -1,
        dist = 9;
      // Ruler and playhead handle always scrub, even above a beat.
      if (y > 32)
        o.getBeats().forEach((b, i) => {
          const d = Math.abs(tx(b.time) - scroll.scrollLeft - x);
          if (d < dist) {
            nearest = i;
            dist = d;
          }
        });
      if (nearest >= 0) {
        o.setSelected(nearest);
        o.updateSelection();
        gesture = {
          kind: "beat",
          beat: o.getBeats()[nearest],
          startClientX: e.clientX,
          changed: false,
        };
      } else {
        o.pause?.();
        gesture = { kind: "scrub" };
        o.seek(timeAt(x));
      }
    }
    canvas.setPointerCapture(e.pointerId);
    gesture.pointerId = e.pointerId;
    gesture.lastEvent = { clientX: e.clientX, altKey: e.altKey };
    edgeScroll();
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (gesture) {
      updateGesture(e);
      return;
    }
    const y = e.clientY - canvas.getBoundingClientRect().top;
    canvas.style.cursor = y <= 32 ? "ew-resize" : "crosshair";
  });
  function stop(e) {
    if (!gesture) return;
    const changed = gesture.changed,
      id = gesture.pointerId;
    gesture = null;
    cancelAnimationFrame(scrollFrame);
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    if (changed) o.changed();
    else draw();
  }
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("lostpointercapture", stop);
  canvas.addEventListener("dblclick", (e) => {
    if (e.button === 0) o.addBeat(timeAt(localX(e)));
  });
  scroll.addEventListener(
    "wheel",
    (e) => {
      if (!o.hasMedia()) return;
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        scroll.scrollLeft +=
          (e.deltaX || e.deltaY) * (e.deltaMode === 1 ? 16 : 1);
        draw();
      } else
        zoom(
          scale *
            Math.exp(
              -clamp(e.deltaY * (e.deltaMode === 1 ? 16 : 1), -300, 300) *
                0.003,
            ),
          e.clientX,
        );
    },
    { passive: false },
  );
  scroll.addEventListener("scroll", draw, { passive: true });
  canvas.addEventListener("keydown", (e) => {
    if (!o.hasMedia()) return;
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      o.pause?.();
      o.seek(e.key === "Home" ? 0 : o.getDuration());
      center();
    }
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoom(scale * 1.5);
    }
    if (e.key === "-") {
      e.preventDefault();
      zoom(scale / 1.5);
    }
  });
  function center() {
    scroll.scrollLeft = Math.max(0, tx(o.getTime()) - viewport() / 2);
    draw();
  }
  function neighbor(sign) {
    if (!o.hasMedia()) return;
    const t = o.getTime(),
      beats = o.getBeats();
    const b =
      sign < 0
        ? [...beats].reverse().find((b) => b.time < t - 0.001)
        : beats.find((b) => b.time > t + 0.001);
    if (b) {
      o.pause?.();
      o.seek(b.time);
      center();
    }
  }
  canvas.setAttribute("role", "slider");
  canvas.setAttribute("aria-valuemin", "0");
  return {
    draw,
    zoom,
    center,
    previous: () => neighbor(-1),
    next: () => neighbor(1),
    getZoom: () => scale,
    reset() {
      gesture = null;
      cancelAnimationFrame(scrollFrame);
      scale = 1;
      scroll.scrollLeft = 0;
      o.onZoom(scale);
      draw();
    },
    fit() {
      zoom(1);
      scroll.scrollLeft = 0;
      draw();
    },
    setSnap(value) {
      snap = value;
      draw();
    },
    setFollow(value) {
      follow = value;
      draw();
    },
  };
}
