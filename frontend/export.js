export function exportFilename(value, mode) {
  const extension = mode === "transparent" ? ".webm" : ".mp4";
  let stem = String(value || "beatbar")
    .trim()
    .replace(/\.(mp4|webm)$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[ .]+$/g, "")
    .slice(0, 100);
  if (!stem) stem = "beatbar";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))
    stem = "beatbar-" + stem;
  return stem + extension;
}
export function createExportDestination({ location, choose, note, toast }) {
  let directory = null;
  const canFile = !!window.showSaveFilePicker,
    canDirectory = !!window.showDirectoryPicker;
  location.querySelector('[value="choose"]').disabled = !canFile;
  choose.disabled = !canDirectory;
  function updateNote() {
    note.textContent =
      location.value === "directory" && directory
        ? "保存到已选文件夹「" +
          directory.name +
          "」，同名自动加序号。本次页面会话有效。"
        : location.value === "choose"
          ? "开始导出时选择完整路径和文件名；取消选择不会开始渲染。"
          : "保存到浏览器的下载文件夹；也可在浏览器设置中开启每次下载前询问保存位置。";
  }
  choose.onclick = async () => {
    try {
      directory = await window.showDirectoryPicker({
        id: "beatbar-exports",
        mode: "readwrite",
      });
      location.querySelector('[value="directory"]').disabled = false;
      location.value = "directory";
      updateNote();
    } catch (error) {
      if (error.name !== "AbortError")
        toast("选择文件夹失败：" + error.message, true);
    }
  };
  location.onchange = updateNote;
  updateNote();
  async function prepare(filename, mode) {
    // This call must run from a user click before starting asynchronous rendering.
    if (location.value === "choose" && canFile) {
      const extension = mode === "transparent" ? ".webm" : ".mp4";
      const handle = await window.showSaveFilePicker({
        id: "beatbar-exports",
        suggestedName: filename,
        types: [
          {
            description: mode === "transparent" ? "WebM 透明视频" : "MP4 视频",
            accept: {
              [mode === "transparent" ? "video/webm" : "video/mp4"]: [
                extension,
              ],
            },
          },
        ],
      });
      if (!handle.name.toLowerCase().endsWith(extension))
        throw Error("请选择 " + extension + " 扩展名，以匹配导出格式");
      return { filename: handle.name, handle };
    }
    if (location.value === "directory" && directory) {
      const permission = await directory.queryPermission({ mode: "readwrite" });
      if (
        permission !== "granted" &&
        (await directory.requestPermission({ mode: "readwrite" })) !== "granted"
      )
        throw Error("未获得所选文件夹的写入权限");
      return { filename, directory };
    }
    return { filename };
  }
  async function save(result, plan) {
    if (!plan.handle && !plan.directory) return null;
    let handle = plan.handle,
      filename = plan.filename;
    if (plan.directory) {
      const dot = filename.lastIndexOf("."),
        stem = filename.slice(0, dot),
        ext = filename.slice(dot);
      let index = 0;
      for (;;) {
        try {
          await plan.directory.getFileHandle(filename);
          index++;
          filename = stem + " (" + index + ")" + ext;
        } catch (error) {
          if (error.name === "NotFoundError") break;
          throw error;
        }
      }
      handle = await plan.directory.getFileHandle(filename, { create: true });
    }
    const response = await fetch(result.url);
    if (!response.ok) throw Error("读取渲染结果失败，仍可从下载列表重试");
    const writable = await handle.createWritable();
    try {
      if (response.body) await response.body.pipeTo(writable);
      else {
        await writable.write(await response.blob());
        await writable.close();
      }
    } catch (error) {
      try {
        await writable.abort();
      } catch {}
      throw error;
    }
    return filename;
  }
  return { prepare, save };
}
