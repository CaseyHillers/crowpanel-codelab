import { createProjectStore } from "./project-store.js";

// Browser saves are explicit. Unsaved source stays in memory, including on errors.
export function createProjectWorkspace({ editor, byId, starter, store = createProjectStore(),
  confirm = message => window.confirm(message), onChange = () => {} }) {
  let draft = { id: null, name: "my_project.py", source: starter };
  let dirty = false;
  let opened = false;
  let saved = [];
  let label = "Not saved";
  const readSaved = () => store.list().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const error = cause => {
    byId("project-save-error").textContent = `${cause.message || "Browser save failed."} Your editor is unchanged; download a .py copy to keep it.`;
    byId("project-save-error").hidden = false;
  };
  const clearError = () => { byId("project-save-error").hidden = true; };
  function refresh() {
    const select = byId("project-select");
    select.replaceChildren();
    const option = (value, text) => {
      const node = select.ownerDocument.createElement("option");
      node.value = value;
      node.textContent = text;
      select.append(node);
    };
    option("", "New project (not saved)");
    for (const project of saved) option(project.id, project.name);
    select.value = draft.id || "";
    byId("project-filename").value = draft.name;
    byId("delete-project").disabled = !draft.id;
    byId("project-save-status").textContent = dirty
      ? "Unsaved changes. Choose Save in browser or download a .py copy."
      : draft.id ? "Saved in this browser. Download a copy before clearing site data." : "Not saved in this browser yet.";
    onChange();
  }
  function showDraft() {
    editor.value = draft.source;
    refresh();
  }
  function canReplace() {
    return !dirty || confirm("Discard unsaved project changes? Save in browser or download your work first if you want to keep it.");
  }
  function open() {
    if (!opened) {
      opened = true;
      try {
        store.load();
        saved = readSaved();
        if (saved.length) {
          draft = { ...saved[0] };
          label = "Saved in browser";
        }
      } catch (cause) { error(cause); }
    }
    showDraft();
  }
  function edited() {
    draft.source = editor.value;
    dirty = true;
    label = "Unsaved changes";
    refresh();
  }
  byId("project-filename").addEventListener("input", () => {
    draft.name = byId("project-filename").value;
    dirty = true;
    label = "Unsaved changes";
    // Do not move the caret while the filename is being typed.
    byId("project-save-status").textContent = "Unsaved changes. Choose Save in browser or download a .py copy.";
    onChange();
  });
  function save() {
    clearError();
    try {
      const result = store.save({ ...draft, source: editor.value });
      draft = { ...result };
      saved = readSaved();
      dirty = false;
      label = "Saved in browser";
      refresh();
    } catch (cause) { error(cause); }
  }
  byId("save-project").addEventListener("click", save);
  byId("new-project").addEventListener("click", () => {
    if (!canReplace()) return;
    clearError();
    let name = "my_project.py";
    for (let index = 2; saved.some(project => project.name === name); index += 1) name = `project_${index}.py`;
    draft = { id: null, name, source: starter };
    dirty = false;
    label = "Not saved";
    showDraft();
    byId("project-filename").focus();
  });
  byId("project-select").addEventListener("change", () => {
    const id = byId("project-select").value;
    if (!id || id === draft.id || !canReplace()) {
      byId("project-select").value = draft.id || "";
      return;
    }
    clearError();
    try {
      store.load();
      const next = store.get(id);
      if (!next) throw new Error("This saved project is no longer available. Your current work is still open.");
      saved = readSaved();
      draft = { ...next };
      dirty = false;
      label = "Saved in browser";
      showDraft();
    } catch (cause) { error(cause); byId("project-select").value = draft.id || ""; }
  });
  byId("delete-project").addEventListener("click", () => {
    if (!draft.id || !confirm(`Delete the browser-saved copy of ${draft.name}? The code will stay open as an unsaved project; device files are unchanged.`)) return;
    clearError();
    try {
      store.remove(draft.id);
      saved = readSaved();
      draft = { ...draft, id: null };
      dirty = true;
      label = "Unsaved changes";
      refresh();
    } catch (cause) { error(cause); }
  });
  return {
    open, edited, save,
    get dirty() { return dirty; },
    get label() { return label; },
    get filename() { return draft.name; },
    reset() {
      if (editor.value !== starter && !confirm("Replace this project's code with the starter? Save in browser or download your work first.")) return;
      editor.value = starter;
      edited();
      editor.focus();
    },
  };
}
