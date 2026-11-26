import assert from "node:assert/strict";
import test from "node:test";
import { createProjectManager } from "../frontend/projects.js";

const ACTIVE_KEY = "beatbar.activeProjectId";
const FIRST_ID = "a".repeat(32);
const SECOND_ID = "b".repeat(32);
const flush = () => new Promise(setImmediate);
const copy = (value) => structuredClone(value);

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

// Only the DOM surface used by the manager is needed; no browser or dependencies.
class Element {
  value = "";
  textContent = "";
  dataset = {};
  children = [];
  open = false;
  listeners = new Map();

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  emit(type) {
    const event = { type, target: this, preventDefault() {} };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return this["on" + type]?.(event);
  }
  click() {
    return this.emit("click");
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  select() {}
}

function fakeDocument() {
  const elements = new Map(
    [
      "projectStatus",
      "projectName",
      "projectDialog",
      "projectSearch",
      "projectList",
      "projectListMessage",
      "saveProject",
      "manageProjects",
      "closeProjects",
      "refreshProjects",
      "newProject",
      "newProjectName",
      "newProjectDialog",
      "newProjectForm",
      "cancelNewProject",
      "deleteProjectLabel",
      "deleteProjectDialog",
      "cancelDeleteProject",
      "confirmDeleteProject",
    ].map((id) => [id, new Element()]),
  );
  elements.get("projectName").value = "未命名项目";
  return {
    title: "BeatBar Studio",
    getElementById(id) {
      assert(elements.has(id), "Unknown DOM element: " + id);
      return elements.get(id);
    },
    createElement: () => new Element(),
  };
}

function fakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function fakeClock() {
  let now = 0;
  let serial = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay = 0, ...args) {
      const id = ++serial;
      timers.set(id, { at: now + delay, callback, args });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    async advance(milliseconds) {
      const end = now + milliseconds;
      // Await each callback's microtasks so completed fetches can cancel timeouts.
      for (let runs = 0; ; runs++) {
        assert(runs < 1000, "Timer callbacks did not settle");
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        const [id, timer] = next;
        now = timer.at;
        timers.delete(id);
        timer.callback(...timer.args);
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

function project(beats = [0.5]) {
  return {
    version: 1,
    media: null,
    beats,
    style: { color: "#71e4c4" },
    bpm: 120,
    editorSettings: { zoom: 2 },
    exportSettings: { mode: "transparent" },
    extension: { note: "保留扩展数据" },
  };
}

function record(doc = project(), revision = 1, id = FIRST_ID, name = "原项目") {
  return {
    id,
    name,
    revision,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:01.000Z",
    project: copy(doc),
  };
}

function harness(t) {
  const document = fakeDocument();
  const storage = fakeStorage();
  const clock = fakeClock();
  const calls = [];
  const replies = [];
  const unexpected = [];
  const toasts = [];
  const restored = [];
  const prepared = [];
  const loading = [];
  let state = project([]);
  let busy = false;
  let writers = 0;
  let maxWriters = 0;

  const fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    const call = {
      method,
      url,
      body: options.body === undefined ? undefined : JSON.parse(options.body),
    };
    calls.push(call);
    const index = replies.findIndex(
      (reply) => reply.method === method && reply.url === url,
    );
    if (index < 0) {
      unexpected.push(method + " " + url);
      throw Error("Unexpected request: " + method + " " + url);
    }
    const reply = replies.splice(index, 1)[0];
    const writing = method !== "GET";
    if (writing) maxWriters = Math.max(maxWriters, ++writers);
    try {
      const body = await (typeof reply.body === "function"
        ? reply.body(call)
        : reply.body);
      return {
        ok: reply.status >= 200 && reply.status < 300,
        status: reply.status,
        json: async () => copy(body),
      };
    } finally {
      if (writing) writers--;
    }
  };

  for (const [key, value] of Object.entries({
    document,
    localStorage: storage,
    fetch,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  // UI handlers deliberately catch errors; still fail on any unplanned request.
  t.after(() => assert.deepEqual(unexpected, [], "Unexpected fetch calls"));

  const manager = createProjectManager({
    capture: () => copy(state),
    prepare: async (doc) => {
      prepared.push(copy(doc));
      return { project: copy(doc) };
    },
    restore: async (value) => {
      assert(value.project, "restore must receive the prepared editor state");
      state = copy(value.project);
      restored.push(copy(state));
    },
    isBusy: () => busy,
    setLoading: (value) => loading.push(value),
    toast: (...args) => toasts.push(args),
  });

  return {
    manager,
    clock,
    storage,
    document,
    calls,
    toasts,
    prepared,
    restored,
    loading,
    element: (id) => document.getElementById(id),
    reply(method, url, body, status = 200) {
      replies.push({ method, url, body, status });
    },
    edit(doc, name) {
      state = copy(doc);
      if (name === undefined) manager.changed();
      else {
        document.getElementById("projectName").value = name;
        document.getElementById("projectName").emit("input");
      }
    },
    setBusy: (value) => (busy = value),
    get state() {
      return copy(state);
    },
    get maxWriters() {
      return maxWriters;
    },
    get status() {
      return document.getElementById("projectStatus").dataset.state;
    },
  };
}

async function resume(t, saved = record()) {
  const h = harness(t);
  h.storage.setItem(ACTIVE_KEY, saved.id);
  h.reply("GET", "/api/projects/" + saved.id, saved);
  await h.manager.init();
  assert.equal(h.manager.activeId, saved.id);
  return h;
}

function findButton(element, action, id) {
  if (element.dataset.action === action && element.dataset.projectId === id)
    return element;
  for (const child of element.children) {
    const found = findButton(child, action, id);
    if (found) return found;
  }
}

function assertPreserved(h, saved, unsaved, name) {
  assert.equal(h.manager.activeId, saved.id);
  assert.deepEqual(h.state, unsaved);
  assert.equal(h.element("projectName").value, name);
  assert.equal(h.storage.getItem(ACTIVE_KEY), saved.id);
  assert.equal(h.manager.hasUnsavedChanges(), true);
  assert.equal(h.manager.isSwitching(), false);
  assert.equal(h.status, "error");
  assert.deepEqual(h.restored, [saved.project]);
  assert.equal(h.loading.at(-1), false);
  assert(h.toasts.some(([, error]) => error === true));
}

test("autosave debounces edits and persists the latest name and document", async (t) => {
  const h = harness(t);
  await h.manager.init();
  h.edit(project([1]));
  await h.clock.advance(600);
  const latest = project([1, 2, 3]);
  h.edit(latest, "自动保存项目");
  await h.clock.advance(600);
  assert.equal(h.calls.length, 0, "new edits must postpone autosave");
  assert.equal(h.manager.hasUnsavedChanges(), true);

  const saved = record(latest, 1, FIRST_ID, "自动保存项目");
  h.reply("POST", "/api/projects", saved);
  await h.clock.advance(500);
  assert.deepEqual(h.calls, [
    {
      method: "POST",
      url: "/api/projects",
      body: { name: saved.name, project: latest },
    },
  ]);
  assert.equal(h.manager.activeId, saved.id);
  assert.equal(h.storage.getItem(ACTIVE_KEY), saved.id);
  assert.equal(h.manager.hasUnsavedChanges(), false);
  assert.equal(h.status, "saved");
  assert.equal(h.document.title, saved.name + " · BeatBar Studio");
  await h.clock.advance(3000);
  assert.equal(h.calls.length, 1, "clean projects must not keep autosaving");
});

test("autosave waits while the editor is busy and resumes afterwards", async (t) => {
  const h = harness(t);
  await h.manager.init();
  const latest = project([2]);
  h.setBusy(true);
  h.edit(latest);
  await h.clock.advance(3000);
  assert.equal(h.calls.length, 0);
  assert.equal(h.manager.hasUnsavedChanges(), true);
  h.reply("POST", "/api/projects", record(latest));
  h.setBusy(false);
  await h.clock.advance(3000);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].body.project, latest);
  assert.equal(h.manager.hasUnsavedChanges(), false);
});

test("edits during a pending save remain dirty until their own autosave", async (t) => {
  const h = harness(t);
  await h.manager.init();
  const first = project([1]);
  h.edit(first, "第一版");
  const pending = deferred();
  h.reply("POST", "/api/projects", pending.promise);
  const firstSave = h.manager.save({ silent: true });
  assert.equal(h.status, "saving");
  assert.equal(h.manager.hasUnsavedChanges(), true);

  const latest = project([1, 2]);
  h.edit(latest, "保存期间的新编辑");
  pending.resolve(record(first, 1, FIRST_ID, "第一版"));
  await firstSave;
  assert.equal(h.manager.hasUnsavedChanges(), true);
  assert.equal(h.status, "dirty");
  assert.deepEqual(h.state, latest);
  assert.equal(h.element("projectName").value, "保存期间的新编辑");
  assert.deepEqual(h.calls[0].body.project, first);

  h.reply(
    "PUT",
    "/api/projects/" + FIRST_ID,
    record(latest, 2, FIRST_ID, "保存期间的新编辑"),
  );
  await h.clock.advance(1000);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].body, {
    name: "保存期间的新编辑",
    project: latest,
    revision: 1,
  });
  assert.equal(h.manager.hasUnsavedChanges(), false);
  assert.equal(h.status, "saved");
});

test("repeated manual saves serialize writes and use each returned revision", async (t) => {
  const h = harness(t);
  await h.manager.init();
  const initial = project([1]);
  const latest = project([1, 3]);
  h.edit(initial);
  const responses = [deferred(), deferred(), deferred()];
  h.reply("POST", "/api/projects", responses[0].promise);
  h.reply("PUT", "/api/projects/" + FIRST_ID, responses[1].promise);
  h.reply("PUT", "/api/projects/" + FIRST_ID, responses[2].promise);

  h.element("saveProject").click();
  h.edit(latest);
  h.element("saveProject").click();
  h.element("saveProject").click();
  await flush();
  assert.equal(h.calls.length, 1, "only one write may be in flight");
  responses[0].resolve(record(initial));
  await flush();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].body.revision, 1);
  assert.deepEqual(h.calls[1].body.project, latest);
  assert.equal(h.manager.hasUnsavedChanges(), true);
  responses[1].resolve(record(latest, 2));
  await flush();
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].body.revision, 2);
  responses[2].resolve(record(latest, 3));
  await flush();

  assert.deepEqual(
    h.calls.map(({ method }) => method),
    ["POST", "PUT", "PUT"],
  );
  assert.deepEqual(h.calls[2].body.project, latest);
  assert.equal(h.maxWriters, 1);
  assert.equal(h.manager.activeId, FIRST_ID);
  assert.equal(h.manager.hasUnsavedChanges(), false);
  await h.clock.advance(3000);
  assert.equal(h.calls.length, 3);
});

for (const failure of ["HTTP 500", "network error"]) {
  test(`${failure} during preservation prevents new project creation without losing edits`, async (t) => {
    const saved = record(project([1]), 4);
    const h = await resume(t, saved);
    const unsaved = project([1, 2, 4]);
    h.edit(unsaved, "仍未保存的原项目");
    if (failure === "HTTP 500")
      h.reply("PUT", "/api/projects/" + saved.id, { detail: "磁盘已满" }, 500);
    else
      h.reply("PUT", "/api/projects/" + saved.id, () => {
        throw TypeError("Failed to fetch");
      });

    h.element("newProject").click();
    h.element("newProjectName").value = "不能创建的新项目";
    h.element("newProjectForm").emit("submit");
    await flush();
    assertPreserved(h, saved, unsaved, "仍未保存的原项目");
    assert.equal(h.element("newProjectDialog").open, true);
    assert.deepEqual(
      h.calls.map(({ method }) => method),
      ["GET", "PUT"],
    );

    // A transient failure must leave the last accepted revision available to retry.
    h.reply("PUT", "/api/projects/" + saved.id, record(unsaved, 5));
    await h.manager.save();
    assert.equal(h.calls.at(-1).body.revision, 4);
    assert.deepEqual(h.calls.at(-1).body.project, unsaved);
    assert.equal(h.manager.activeId, saved.id);
    assert.equal(h.manager.hasUnsavedChanges(), false);
  });
}

test("a failed preservation save blocks opening another project and retains the original editor", async (t) => {
  const saved = record(project([1]), 7);
  const h = await resume(t, saved);
  const unsaved = project([1, 4, 8]);
  h.edit(unsaved, "切换前的更改");
  const other = record(project([9]), 3, SECOND_ID, "另一个项目");
  h.reply("GET", "/api/projects", { projects: [other] });
  h.element("manageProjects").click();
  await flush();
  const open = findButton(h.element("projectList"), "open", other.id);
  assert(
    open,
    "the project library must offer the other project's Open button",
  );
  h.reply("GET", "/api/projects/" + other.id, other);
  h.reply("PUT", "/api/projects/" + saved.id, { detail: "无法写入" }, 500);
  open.click();
  await flush();

  assertPreserved(h, saved, unsaved, "切换前的更改");
  assert.equal(h.element("projectDialog").open, true);
  const writes = h.calls.filter(({ method }) => method !== "GET");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url, "/api/projects/" + saved.id);
  assert.equal(writes[0].body.revision, 7);
  assert.deepEqual(writes[0].body.project, unsaved);
});

test("409 conflicts reject queued writes, stop retries and keep local changes dirty", async (t) => {
  const saved = record(project([1]), 2);
  const h = await resume(t, saved);
  const local = project([1, 5]);
  h.edit(local, "本地未合并更改");
  const conflict = deferred();
  h.reply("PUT", "/api/projects/" + saved.id, conflict.promise, 409);
  const outcomes = Promise.allSettled([
    h.manager.save({ force: true }),
    h.manager.save({ force: true }),
  ]);
  conflict.resolve({ detail: "项目已被其他窗口修改" });
  for (const outcome of await outcomes) {
    assert.equal(outcome.status, "rejected");
    assert.equal(outcome.reason.status, 409);
  }
  assertPreserved(h, saved, local, "本地未合并更改");
  await assert.rejects(h.manager.save({ force: true }), /其他窗口/);

  const newer = project([1, 5, 9]);
  h.edit(newer, "冲突后继续编辑");
  h.element("saveProject").click();
  await h.clock.advance(5000);
  assertPreserved(h, saved, newer, "冲突后继续编辑");
  assert.equal(
    h.calls.length,
    2,
    "a conflict must stop all later network writes",
  );
});

test("reading an imported file locks project switching before parsing completes", async (t) => {
  const current = record(project([1]), 3);
  const h = await resume(t, current);
  const file = deferred();
  const imported = project([2, 4]);
  const opening = h.manager.importProject(file.promise, "导入项目");
  assert.equal(h.manager.isSwitching(), true);
  assert.deepEqual(h.state, current.project);
  h.element("newProject").click();
  assert.equal(h.element("newProjectDialog").open, false);
  assert.equal(h.calls.length, 1);
  h.reply("PUT", "/api/projects/" + current.id, record(current.project, 4));
  h.reply("POST", "/api/projects", record(imported, 1, SECOND_ID, "导入项目"));
  file.resolve(imported);
  await opening;
  assert.equal(h.manager.activeId, SECOND_ID);
  assert.deepEqual(h.state, imported);
  assert.equal(h.manager.isSwitching(), false);
  assert.equal(h.manager.hasUnsavedChanges(), false);
});

test("init restores the remembered project through prepare and restore without writing", async (t) => {
  const saved = record(project([0.25, 1.25, 2.25]), 12, SECOND_ID, "上次项目");
  const h = await resume(t, saved);
  assert.deepEqual(h.calls, [
    { method: "GET", url: "/api/projects/" + saved.id, body: undefined },
  ]);
  assert.deepEqual(h.prepared, [saved.project]);
  assert.deepEqual(h.restored, [saved.project]);
  assert.deepEqual(h.state, saved.project);
  assert.equal(h.element("projectName").value, saved.name);
  assert.equal(h.document.title, saved.name + " · BeatBar Studio");
  assert.equal(h.storage.getItem(ACTIVE_KEY), saved.id);
  assert.equal(h.manager.hasUnsavedChanges(), false);
  assert.equal(h.manager.isSwitching(), false);
  assert.equal(h.status, "saved");
  assert.deepEqual(h.loading, [true, false]);
  await h.clock.advance(3000);
  assert.equal(h.calls.length, 1);
});
