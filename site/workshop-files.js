// Bundled workshop source and edits live in this tab. Selecting a file never
// reads the board, writes device files, runs source or persists browser data.
export function createWorkshopFiles({ editor, byId, files, onPrimary = () => {},
  onChange = () => {}, confirm = message => window.confirm(message) }) {
  const catalog = new Map(files.map(file => [file.name, { ...file }]));
  const drafts = new Map();
  const select = byId("workshop-file-select");
  let selected = null;

  function capture() {
    if (selected) drafts.set(selected, editor.value);
  }
  function current() {
    const file = catalog.get(selected);
    return file ? { ...file, source: editor.value } : null;
  }
  function configure(primaryLabel) {
    capture();
    selected = null;
    select.replaceChildren();
    const document = select.ownerDocument;
    const primary = document.createElement("option");
    primary.value = "";
    primary.textContent = primaryLabel;
    select.append(primary);
    for (const [kind, label] of [["script", "Workshop examples"], ["library", "Workshop libraries"], ["certificate", "HTTPS certificates"]]) {
      const group = document.createElement("optgroup");
      group.label = label;
      for (const file of catalog.values()) {
        if (file.kind !== kind || file.name === primaryLabel) continue;
        const option = document.createElement("option");
        option.value = file.name;
        option.textContent = file.name;
        group.append(option);
      }
      if (group.children.length) select.append(group);
    }
    select.value = "";
  }
  select.addEventListener("change", () => {
    const name = select.value;
    if (name === selected || (!name && !selected)) return;
    if (name && !catalog.has(name)) {
      select.value = selected || "";
      return;
    }
    capture();
    selected = name || null;
    if (!selected) {
      onPrimary();
      return;
    }
    const file = catalog.get(selected);
    editor.value = drafts.get(selected) ?? file.source;
    onChange();
  });

  return {
    configure,
    edited() {
      if (!selected) return;
      capture();
      onChange();
    },
    reset() {
      if (!selected) return;
      const file = catalog.get(selected);
      if (editor.value !== file.source && !confirm(`Discard edits to ${file.name} and restore the bundled source? Download your work first if you want to keep it.`)) return;
      editor.value = file.source;
      drafts.delete(selected);
      onChange();
      editor.focus();
    },
    get active() { return current(); },
    get source() { return selected ? editor.value : null; },
    get label() {
      return selected && editor.value !== catalog.get(selected).source ? "Edited · tab only" : "Sample";
    },
    get dirty() {
      for (const [name, source] of drafts) {
        if (source !== catalog.get(name).source) return true;
      }
      return Boolean(selected && editor.value !== catalog.get(selected).source);
    },
  };
}
