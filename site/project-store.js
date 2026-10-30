export const STORAGE_KEY = "crowpanel.projects.v1";

export function normalizeProjectName(value) {
  if (typeof value !== "string") throw new Error("Enter a Python filename.");
  let name = value.trim();
  if (name && !name.includes(".")) name += ".py";
  if (name.length > 64 || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.py$/.test(name) || name.includes("..")) {
    throw new Error("Use a Python filename of at most 64 characters, with letters, numbers, underscores or hyphens and a .py extension. No folders.");
  }
  return name;
}

function validId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
}

function validTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
}

// Explicit saves only. Lesson drafts and credentials must not be passed here.
// Each mutation rereads storage so other tabs' separate projects are preserved.
export function createProjectStore({
  getStorage = () => globalThis.localStorage,
  now = () => new Date().toISOString(),
  makeId = () => globalThis.crypto.randomUUID(),
} = {}) {
  function read() {
    let storage, raw;
    try {
      storage = getStorage();
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      throw new Error("Browser storage is unavailable. Download your code to keep it, or allow site storage in your browser settings.");
    }
    if (raw === null) return { storage, projects: [] };
    try {
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.projects)) throw new Error("Invalid version or projects");
      const ids = new Set();
      const names = new Set();
      const projects = data.projects.map(project => {
        if (!project || !validId(project.id) || typeof project.source !== "string"
            || !validTimestamp(project.updatedAt) || normalizeProjectName(project.name) !== project.name
            || ids.has(project.id) || names.has(project.name.toLowerCase())) throw new Error("Invalid project");
        ids.add(project.id);
        names.add(project.name.toLowerCase());
        return { id: project.id, name: project.name, source: project.source, updatedAt: project.updatedAt };
      });
      return { storage, projects };
    } catch {
      throw new Error("Saved projects could not be read, or use an unsupported version. Existing browser data has not been changed. Download your current code before troubleshooting site storage.");
    }
  }

  function write(storage, projects) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projects }));
    } catch {
      throw new Error("Could not save projects to browser storage. It may be full or blocked. Your previous saved projects are unchanged; download this draft to keep it.");
    }
  }

  return {
    load() { return read().projects; },
    list() { return read().projects; },
    get(id) { return read().projects.find(project => project.id === id) ?? null; },
    save({ id, name, source }) {
      const { storage, projects } = read();
      name = normalizeProjectName(name);
      if (typeof source !== "string") throw new Error("Project source must be Python text.");
      const index = id == null ? -1 : projects.findIndex(project => project.id === id);
      if (id != null && index < 0) throw new Error("This saved project no longer exists. Create a new project to keep your draft.");
      if (projects.some(project => project.id !== id && project.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("A project with this filename already exists. Choose another name.");
      }
      const project = { id: id ?? makeId(), name, source, updatedAt: now() };
      if (!validId(project.id) || !validTimestamp(project.updatedAt)
          || (index < 0 && projects.some(item => item.id === project.id))) {
        throw new Error("Could not create a project ID or save time. Download your draft and retry.");
      }
      if (index < 0) projects.push(project);
      else projects[index] = project;
      write(storage, projects);
      return { ...project };
    },
    remove(id) {
      const { storage, projects } = read();
      if (!projects.some(project => project.id === id)) throw new Error("This saved project no longer exists.");
      write(storage, projects.filter(project => project.id !== id));
    },
  };
}
