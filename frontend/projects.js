const ACTIVE_KEY = "beatbar.activeProjectId";
const $ = (id) => document.getElementById(id);

// One writer per editor, with optimistic revisions across browser windows.
export function createProjectManager(o) {
  let active = null,
    initialized = false,
    switching = false,
    dirty = false,
    generation = 0,
    saving = null,
    timer,
    conflicted = false,
    records = [],
    deleting = null;

  function status(text, state) {
    $("projectStatus").textContent = text;
    $("projectStatus").dataset.state = state;
  }
  function remember(id) {
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* The project itself is stored by the local service. */
    }
  }
  function lastId() {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  }
  async function request(path, method = "GET", body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(path, {
        method,
        signal: controller.signal,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = Error(
          typeof data.detail === "string" ? data.detail : "项目操作失败",
        );
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError")
        throw Error("连接超时，进度尚未确认保存，请重试");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  const name = () =>
    $("projectName").value.trim().slice(0, 100) || "未命名项目";
  function activate(record) {
    active = record;
    $("projectName").value = record.name;
    dirty = false;
    conflicted = false;
    remember(record.id);
    status(
      "已保存到本机 · " +
        new Date(record.updatedAt).toLocaleTimeString("zh-CN"),
      "saved",
    );
    document.title = record.name + " · BeatBar Studio";
  }
  function changed() {
    if (!initialized || switching) return;
    generation++;
    dirty = true;
    clearTimeout(timer);
    if (conflicted) {
      status("项目已在其他窗口更新，请导出 JSON 备份后重新打开", "error");
      return;
    }
    status("有更改 · 即将自动保存", "dirty");
    timer = setTimeout(() => {
      if (o.isBusy()) {
        timer = setTimeout(() => changed(), 900);
        return;
      }
      save({ silent: true }).catch(() => {});
    }, 900);
  }
  async function save({ silent = false, force = false } = {}) {
    clearTimeout(timer);
    if (saving) {
      await saving;
      if (!dirty && !force) return active;
      return save({ silent, force });
    }
    if (conflicted)
      throw Error(
        "其他窗口已更新此项目，请先导出 JSON 备份，再重新打开页面以读取最新版本",
      );
    if (!dirty && active && !force) return active;
    const version = generation;
    const payload = {
      name: name(),
      project: o.capture(),
      ...(active ? { revision: active.revision } : {}),
    };
    status("正在保存…", "saving");
    saving = (async () => {
      try {
        const record = await request(
          active ? "/api/projects/" + active.id : "/api/projects",
          active ? "PUT" : "POST",
          payload,
        );
        active = record;
        remember(record.id);
        dirty = generation !== version;
        document.title = name() + " · BeatBar Studio";
        status(
          dirty
            ? "有新更改 · 等待保存"
            : "已保存到本机 · " +
                new Date(record.updatedAt).toLocaleTimeString("zh-CN"),
          dirty ? "dirty" : "saved",
        );
        if (!silent) o.toast("项目已保存到本机");
        return record;
      } catch (error) {
        dirty = true;
        conflicted = error.status === 409;
        status(
          conflicted
            ? "其他窗口已更新 · 请先导出 JSON 备份"
            : "保存失败 · 请点击保存重试",
          "error",
        );
        o.toast("项目保存失败：" + error.message, true);
        throw error;
      } finally {
        saving = null;
      }
    })();
    const record = await saving;
    if (dirty && !switching)
      timer = setTimeout(() => save({ silent: true }).catch(() => {}), 900);
    return record;
  }
  async function preserve() {
    if (saving) await saving;
    if (active || dirty) await save({ silent: true, force: true });
  }
  async function transition(action) {
    if (switching || o.isBusy()) return;
    switching = true;
    clearTimeout(timer);
    o.setLoading(true);
    try {
      return await action();
    } catch (error) {
      o.toast("项目操作未完成：" + error.message, true);
    } finally {
      switching = false;
      o.setLoading(false);
    }
  }
  async function open(id) {
    await transition(async () => {
      if (id === active?.id) {
        $("projectDialog").close();
        return;
      }
      const record = await request("/api/projects/" + id);
      const prepared = await o.prepare(record.project);
      await preserve();
      await o.restore(prepared);
      activate(record);
      $("projectDialog").close();
      o.toast("已打开项目：" + record.name);
    });
  }
  async function importProject(doc, projectName = "导入的项目") {
    return transition(async () => {
      const project = await doc;
      const prepared = await o.prepare(project);
      await preserve();
      const record = await request("/api/projects", "POST", {
        name: projectName.trim().slice(0, 100) || "未命名项目",
        project,
      });
      await o.restore(prepared);
      activate(record);
      $("projectDialog").close();
      $("newProjectDialog").close();
      o.toast("已打开项目：" + record.name);
      return record;
    });
  }
  function render() {
    const query = $("projectSearch").value.trim().toLocaleLowerCase();
    const visible = records.filter((r) =>
      (r.name + " " + (r.mediaName || "")).toLocaleLowerCase().includes(query),
    );
    $("projectList").replaceChildren();
    $("projectListMessage").textContent = visible.length
      ? visible.length + " 个项目"
      : query
        ? "没有匹配的项目"
        : "还没有保存的项目，开始编辑后会自动保存。";
    for (const r of visible) {
      const row = document.createElement("div");
      row.className = "project-row" + (r.id === active?.id ? " current" : "");
      row.dataset.projectId = r.id;
      const info = document.createElement("div");
      info.className = "project-row-info";
      const title = document.createElement("strong");
      title.textContent = r.name + (r.id === active?.id ? " · 当前项目" : "");
      const detail = document.createElement("small");
      detail.textContent =
        (r.mediaName || "未关联素材 · 草稿") +
        " · " +
        r.beatCount +
        " 拍 · " +
        new Date(r.updatedAt).toLocaleString("zh-CN");
      info.append(title, detail);
      const actions = document.createElement("div");
      actions.className = "project-row-actions";
      for (const [action, text] of [
        ["open", "打开"],
        ["duplicate", "复制"],
        ["delete", "删除"],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.dataset.action = action;
        button.dataset.projectId = r.id;
        if (action === "delete") button.className = "quiet danger-text";
        button.onclick = () => {
          if (action === "open") open(r.id);
          else if (action === "duplicate") duplicate(r.id);
          else {
            deleting = r;
            $("deleteProjectLabel").textContent =
              "确定删除「" + r.name + "」？此操作无法撤销。";
            $("deleteProjectDialog").showModal();
          }
        };
        actions.append(button);
      }
      row.append(info, actions);
      $("projectList").append(row);
    }
  }
  let listRequest = 0;
  async function refresh() {
    const serial = ++listRequest;
    $("projectListMessage").textContent = "正在读取项目…";
    try {
      const data = await request("/api/projects");
      if (serial !== listRequest) return;
      records = data.projects;
      render();
    } catch (error) {
      if (serial !== listRequest) return;
      $("projectListMessage").textContent =
        "读取失败：" + error.message + "，可点击刷新重试。";
    }
  }
  async function duplicate(id) {
    await transition(async () => {
      await preserve();
      const original = await request("/api/projects/" + id);
      const prepared = await o.prepare(original.project);
      const record = await request("/api/projects", "POST", {
        name: original.name.slice(0, 95) + " 副本",
        project: original.project,
      });
      await o.restore(prepared);
      activate(record);
      $("projectDialog").close();
      o.toast("已创建项目副本");
    });
  }
  async function init() {
    switching = true;
    o.setLoading(true);
    const id = lastId();
    try {
      if (id) {
        status("正在恢复上次项目…", "saving");
        const record = await request("/api/projects/" + encodeURIComponent(id));
        await o.restore(await o.prepare(record.project));
        activate(record);
      }
    } catch (error) {
      status("上次项目未恢复 · 可在项目库重新打开", "error");
      o.toast("上次项目未恢复：" + error.message, true);
    } finally {
      initialized = true;
      switching = false;
      o.setLoading(false);
    }
  }
  $("saveProject").onclick = () => {
    if (!switching && !o.isBusy()) save({ force: true }).catch(() => {});
  };
  $("projectName").addEventListener("input", changed);
  $("projectName").addEventListener("blur", () => {
    if (!$("projectName").value.trim()) $("projectName").value = "未命名项目";
  });
  $("manageProjects").onclick = () => {
    if (switching || o.isBusy()) return;
    $("projectDialog").showModal();
    refresh();
  };
  $("closeProjects").onclick = () => $("projectDialog").close();
  $("refreshProjects").onclick = refresh;
  $("projectSearch").oninput = render;
  $("newProject").onclick = () => {
    if (switching || o.isBusy()) return;
    $("newProjectName").value = "未命名项目";
    $("newProjectDialog").showModal();
    $("newProjectName").select();
  };
  $("cancelNewProject").onclick = () => $("newProjectDialog").close();
  $("newProjectForm").onsubmit = (event) => {
    event.preventDefault();
    importProject(
      { version: 1, media: null, beats: [], style: {}, bpm: 120 },
      $("newProjectName").value,
    );
  };
  $("cancelDeleteProject").onclick = () => $("deleteProjectDialog").close();
  $("confirmDeleteProject").onclick = () =>
    transition(async () => {
      if (!deleting) return;
      if (deleting.id === active?.id) {
        await preserve();
        deleting = active;
      }
      await request(
        "/api/projects/" + deleting.id + "?revision=" + deleting.revision,
        "DELETE",
      );
      if (deleting.id === active?.id) {
        const blank = await o.prepare({
          version: 1,
          media: null,
          beats: [],
          style: {},
          bpm: 120,
        });
        await o.restore(blank);
        active = null;
        dirty = false;
        conflicted = false;
        $("projectName").value = "未命名项目";
        remember(null);
        document.title = "BeatBar Studio · 节奏可视化工作台";
        status("可随时保存草稿", "saved");
      }
      deleting = null;
      $("deleteProjectDialog").close();
      await refresh();
      o.toast("项目已删除，原始素材仍然保留");
    });
  return {
    changed,
    save,
    init,
    importProject,
    hasUnsavedChanges: () => dirty || !!saving,
    isSwitching: () => switching,
    get activeId() {
      return active?.id || null;
    },
  };
}
