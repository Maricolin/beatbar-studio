export const DEFAULT_STYLE = Object.freeze({
  color: "#b7f56c",
  secondaryColor: "#67dce8",
  barColor: "#30363e",
  backgroundColor: "#111820",
  colorMode: "solid",
  position: 0.82,
  barWidth: 0.8,
  barHeight: 44,
  speed: 3,
  marker: 0.15,
  pattern: "circle",
  motion: "right-left",
  hitEffect: "ring",
  hitDuration: 0.45,
  effectIntensity: 1,
  beatScale: 1,
  patternImage: null,
});

export const PALETTES = [
  {
    id: "lime",
    name: "青柠电波",
    color: "#b7f56c",
    secondaryColor: "#67dce8",
    barColor: "#30363e",
    backgroundColor: "#111820",
  },
  {
    id: "aurora",
    name: "极光漫游",
    color: "#67dce8",
    secondaryColor: "#c4a0ff",
    barColor: "#283643",
    backgroundColor: "#101a25",
  },
  {
    id: "sunset",
    name: "落日余温",
    color: "#ff9c74",
    secondaryColor: "#f7d774",
    barColor: "#44332f",
    backgroundColor: "#211719",
  },
  {
    id: "candy",
    name: "莓果霓虹",
    color: "#ff6fae",
    secondaryColor: "#ab9bff",
    barColor: "#3c2b43",
    backgroundColor: "#1b1326",
  },
  {
    id: "ocean",
    name: "深海蓝调",
    color: "#7eaeff",
    secondaryColor: "#65efd0",
    barColor: "#243a4b",
    backgroundColor: "#0e1a28",
  },
  {
    id: "mono",
    name: "极简银白",
    color: "#f2f4f8",
    secondaryColor: "#8a98ad",
    barColor: "#343a44",
    backgroundColor: "#15181e",
  },
];

export const PATTERNS = [
  { id: "circle", name: "圆点", icon: "●" },
  { id: "diamond", name: "菱形", icon: "◆" },
  { id: "triangle", name: "三角", icon: "▲" },
  { id: "star", name: "星芒", icon: "✦" },
  { id: "pill", name: "胶囊", icon: "━" },
  { id: "hexagon", name: "六边形", icon: "⬢" },
  { id: "heart", name: "心形", icon: "♥" },
  { id: "custom", name: "自定义", icon: "↥" },
];

export function mixColor(from, to, amount) {
  const a = from
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16));
  const b = to
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16));
  return (
    "#" +
    a
      .map((v, i) =>
        Math.round(v + (b[i] - v) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function beatColor(style, index, strength, side = 0) {
  if (style.colorMode === "strength")
    return mixColor(style.secondaryColor, style.color, strength);
  if (style.colorMode === "alternate")
    return (style.motion === "meet" ? side === 1 : index % 2 === 1)
      ? style.secondaryColor
      : style.color;
  return style.color;
}

export function drawShape(ctx, pattern, x, y, r) {
  ctx.beginPath();
  if (pattern === "circle" || pattern === "custom")
    ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (pattern === "pill")
    ctx.roundRect(x - r, y - r * 0.7, r * 2, r * 1.4, Math.max(1, r * 0.7));
  else {
    let points;
    if (pattern === "diamond")
      points = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
    else if (pattern === "triangle")
      points = [
        [0, -1],
        [1, 1],
        [-1, 1],
      ];
    else if (pattern === "heart")
      points = Array.from({ length: 64 }, (_, i) => {
        const a = (i * Math.PI * 2) / 64;
        return [
          (16 * Math.sin(a) ** 3) / 18,
          -(
            13 * Math.cos(a) -
            5 * Math.cos(2 * a) -
            2 * Math.cos(3 * a) -
            Math.cos(4 * a)
          ) / 18,
        ];
      });
    else {
      const count = pattern === "star" ? 10 : 6;
      points = Array.from({ length: count }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / count;
        const length = pattern === "star" && i % 2 ? 0.46 : 1;
        return [Math.cos(a) * length, Math.sin(a) * length];
      });
    }
    points.forEach(([px, py], i) =>
      i
        ? ctx.lineTo(x + px * r, y + py * r)
        : ctx.moveTo(x + px * r, y + py * r),
    );
    ctx.closePath();
  }
  ctx.fill();
}

export function beatPositions(style, left, width, marker, radius, delta) {
  if (style.motion === "meet") {
    const progress = 1 - delta / style.speed;
    return [
      left + radius + progress * Math.max(0, marker - left - radius),
      left +
        width -
        radius -
        progress * Math.max(0, left + width - radius - marker),
    ];
  }
  const distance = (delta / style.speed) * width;
  return [
    style.motion === "left-right"
      ? marker - distance * style.marker
      : marker + distance * (1 - style.marker),
  ];
}

function firstVisible(beats, time) {
  let low = 0,
    high = beats.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (beats[mid].time < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function drawTrack(
  ctx,
  width,
  height,
  beats,
  time,
  style,
  image = null,
) {
  const bw = width * style.barWidth,
    left = (width - bw) / 2;
  const y = height * style.position,
    bh = Math.min(height, style.barHeight);
  const marker = left + bw * (style.motion === "meet" ? 0.5 : style.marker);
  const start = firstVisible(beats, time - style.hitDuration);
  const visible = [];
  for (
    let i = start;
    i < beats.length && beats[i].time <= time + style.speed;
    i++
  )
    visible.push(i);
  ctx.fillStyle = style.barColor;
  ctx.beginPath();
  ctx.roundRect(left, y - bh / 2, bw, bh, Math.min(6, bh / 3));
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, y - bh / 2, bw, bh);
  ctx.clip();
  for (const i of visible) {
    const beat = beats[i],
      delta = beat.time - time;
    if (delta < 0) continue;
    const r = bh * 0.3 * (0.55 + 0.45 * beat.strength) * style.beatScale;
    beatPositions(style, left, bw, marker, r, delta).forEach((x, side) => {
      ctx.fillStyle = beatColor(style, i, beat.strength, side);
      if (style.pattern === "custom" && image?.complete && image.naturalWidth) {
        const scale = Math.min(
          (r * 2) / image.naturalWidth,
          (r * 2) / image.naturalHeight,
        );
        const w = image.naturalWidth * scale,
          h = image.naturalHeight * scale;
        ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
      } else drawShape(ctx, style.pattern, x, y, r);
    });
  }
  ctx.restore();
  if (style.hitEffect !== "none")
    for (const i of visible) {
      const beat = beats[i],
        age = time - beat.time;
      if (age < 0 || age >= style.hitDuration) continue;
      const progress = age / style.hitDuration;
      const r = bh * 0.3 * (0.55 + 0.45 * beat.strength) * style.beatScale;
      const color =
        style.colorMode === "alternate" && style.motion === "meet"
          ? mixColor(style.color, style.secondaryColor, 0.5)
          : beatColor(style, i, beat.strength);
      ctx.save();
      ctx.globalAlpha = Math.min(
        1,
        (1 - progress) *
          style.effectIntensity *
          ({ ring: 0.85, flash: 0.3, burst: 0.9 }[style.hitEffect] || 0),
      );
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1, bh * 0.04);
      ctx.lineCap = "round";
      const radius = r * (1 + progress * 3 * style.effectIntensity);
      ctx.beginPath();
      if (style.hitEffect === "burst") {
        const inner = r * (1 + progress * 2),
          length = r * (0.7 + progress * 1.5) * style.effectIntensity;
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          ctx.moveTo(marker + Math.cos(a) * inner, y + Math.sin(a) * inner);
          ctx.lineTo(
            marker + Math.cos(a) * (inner + length),
            y + Math.sin(a) * (inner + length),
          );
        }
        ctx.stroke();
      } else {
        ctx.arc(marker, y, radius, 0, Math.PI * 2);
        if (style.hitEffect === "ring") ctx.stroke();
        else ctx.fill();
      }
      ctx.restore();
    }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(marker - 1, y - bh * 0.7, 2, bh * 1.4);
}
