import assert from "node:assert/strict";
import { exportFilename, createExportDestination } from "../frontend/export.js";
import { timeToX, xToTime } from "../frontend/timeline.js";
import {
  DEFAULT_STYLE,
  beatColor,
  loudnessAmount,
} from "../frontend/visuals.js";
for (const seconds of [8, 60, 1200])
  for (const width of [390, 1600, 500000])
    for (const t of [0, seconds * 0.5, seconds])
      assert(
        Math.abs(xToTime(timeToX(t, seconds, width), seconds, width) - t) <
          1e-8,
      );
assert.equal(xToTime(-100, 8, 500), 0);
assert.equal(xToTime(10000, 8, 500), 8);
assert.equal(exportFilename(" 我的节奏.mp4 ", "transparent"), "我的节奏.webm");
assert.equal(exportFilename("CON", "green"), "beatbar-CON.mp4");
assert.equal(exportFilename("../bad:name", "composite"), ".._bad_name.mp4");
assert.equal(exportFilename("...", "composite"), "beatbar.mp4");
assert(exportFilename("x".repeat(500), "green").length <= 104);
const style = {
  ...DEFAULT_STYLE,
  color: "#ffffff",
  colorMode: "loudness",
  dbFloor: -48,
  dbCeiling: -6,
};
assert.equal(loudnessAmount(style, 1, -100), 0);
assert.equal(loudnessAmount(style, 1, 0), 1);
assert(loudnessAmount(style, 1, -35) < loudnessAmount(style, 1, -10));
assert.equal(beatColor(style, 0, 1, 0, -48), "#404346");
assert.equal(beatColor(style, 0, 0.2, 0, -6), "#ffffff");
assert(loudnessAmount(style, 0.1) < loudnessAmount(style, 1));
console.log(
  "PASS timeline coordinate invariants, filename normalization and dB color mapping",
);
const errors = [],
  opts = { choose: {}, note: {}, toast: (...args) => errors.push(args) };
const options = { choose: {}, directory: { disabled: true } };
const location = {
  value: "browser",
  querySelector: (s) =>
    s.includes("directory") ? options.directory : options.choose,
};
globalThis.window = {};
let api = createExportDestination({ ...opts, location });
assert(options.choose.disabled);
assert(opts.choose.disabled);
assert.deepEqual(await api.prepare("test.mp4", "composite"), {
  filename: "test.mp4",
});
let writes = 0,
  createdName = null;
const handle = {
  name: "renamed.mp4",
  createWritable: async () =>
    new WritableStream({
      write(bytes) {
        writes += bytes.byteLength;
      },
    }),
};
const directory = {
  name: "Exports",
  queryPermission: async () => "granted",
  getFileHandle: async (name, options) => {
    if (options?.create) {
      createdName = name;
      return handle;
    }
    if (name === "song.mp4" || name === "song (1).mp4") return {};
    throw new DOMException("missing", "NotFoundError");
  },
};
window.showSaveFilePicker = async () => handle;
window.showDirectoryPicker = async () => directory;
api = createExportDestination({ ...opts, location });
location.value = "choose";
const plan = await api.prepare("test.mp4", "composite");
assert.equal(plan.filename, "renamed.mp4");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3, 4]));
assert.equal(await api.save({ url: "/test" }, plan), "renamed.mp4");
assert.equal(writes, 4);
await opts.choose.onclick();
assert.equal(location.value, "directory");
assert(!options.directory.disabled);
const folderPlan = await api.prepare("song.mp4", "composite");
assert.equal(await api.save({ url: "/test" }, folderPlan), "song (2).mp4");
assert.equal(createdName, "song (2).mp4");
assert.equal(writes, 8);
window.showSaveFilePicker = async () => ({ name: "wrong.webm" });
location.value = "choose";
await assert.rejects(api.prepare("test.mp4", "composite"), /扩展名/);
window.showSaveFilePicker = async () => {
  throw new DOMException("cancelled", "AbortError");
};
await assert.rejects(api.prepare("test.mp4", "composite"), {
  name: "AbortError",
});
location.value = "directory";
directory.queryPermission = async () => "denied";
directory.requestPermission = async () => "denied";
await assert.rejects(api.prepare("test.mp4", "composite"), /写入权限/);
assert.deepEqual(errors, []);
globalThis.fetch = originalFetch;
console.log(
  "PASS native save handles, directory collision numbering, extension/permission/cancel behavior and unsupported browser fallback",
);
