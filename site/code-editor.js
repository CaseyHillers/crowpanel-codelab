import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const paperTheme = EditorView.theme({
  "&": {
    height: "330px",
    minHeight: "280px",
    minWidth: "0",
    maxWidth: "100%",
    resize: "vertical",
    overflow: "hidden",
    backgroundColor: "var(--surface, #ffffff)",
    color: "var(--text, #131416)",
    borderBlock: "1px solid var(--border, #e8eaec)",
    fontSize: "14px",
  },
  "&.cm-focused": { outline: "2px solid var(--accent, #1b6c80)", outlineOffset: "-2px" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    lineHeight: "1.65",
  },
  ".cm-content": { padding: "16px 0", caretColor: "#131416" },
  ".cm-content:focus-visible": { outline: "none" },
  ".cm-line": { padding: "0 16px" },
  ".cm-gutters": {
    backgroundColor: "var(--ground, #f4f6f8)",
    color: "#62655f",
    borderRight: "1px solid var(--border, #e8eaec)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px", minWidth: "3ch" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#d9e8ec",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#131416" },
  "& .cm-matchingBracket": { backgroundColor: "#d9e8ec", color: "#131416", outline: "1px solid #1b6c80" },
  "& .cm-nonmatchingBracket": { color: "#a51d24", textDecoration: "underline" },
}, { dark: false });

const pythonHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#8b3348" },
  { tag: [tags.string, tags.special(tags.string)], color: "#256444" },
  { tag: [tags.number, tags.bool, tags.null], color: "#9b4c16" },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName), tags.className], color: "#1b6c80" },
  { tag: tags.comment, color: "#62655f", fontStyle: "italic" },
  { tag: [tags.operator, tags.punctuation], color: "#434641" },
  { tag: tags.invalid, color: "#a51d24", textDecoration: "underline" },
]);

export function createCodeEditor(textarea) {
  const attributes = {
    "aria-label": textarea.getAttribute("aria-label") || "Python code editor",
    "aria-describedby": textarea.getAttribute("aria-describedby") || "editor-help",
    spellcheck: "false",
    autocapitalize: "off",
    autocomplete: "off",
    autocorrect: "off",
  };
  const contentAttributes = new Compartment();
  const extensions = [
    python(),
    lineNumbers(),
    history(),
    drawSelection(),
    bracketMatching(),
    indentOnInput(),
    indentUnit.of("    "),
    EditorState.tabSize.of(4),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    contentAttributes.of(EditorView.contentAttributes.of(attributes)),
    paperTheme,
    syntaxHighlighting(pythonHighlight),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      textarea.value = update.state.doc.toString();
      textarea.dispatchEvent(new textarea.ownerDocument.defaultView.Event("input", { bubbles: true }));
    }),
  ];
  const createState = () => EditorState.create({ doc: textarea.value, extensions });
  const wasHidden = textarea.hidden;
  let view;
  try {
    view = new EditorView({ state: createState(), root: textarea.getRootNode() });
    textarea.after(view.dom);
    textarea.hidden = true;
  } catch {
    view?.destroy();
    view?.dom.remove();
    textarea.hidden = wasHidden;
    return textarea;
  }

  const eventTarget = (type) => type === "input" ? textarea : view.contentDOM;
  const eventOptions = (type, options) => type === "keydown"
    ? { ...(typeof options === "object" ? options : {}), capture: true }
    : options;

  return {
    get value() {
      return view.state.doc.toString();
    },
    set value(value) {
      textarea.value = value;
      view.setState(createState());
    },
    focus() {
      view.focus();
    },
    setAttribute(name, value) {
      textarea.setAttribute(name, value);
      const nextValue = String(value);
      // Input listeners can update status while CodeMirror is dispatching.
      // Do not start a nested editor update for an unchanged label.
      if (attributes[name] === nextValue) return;
      attributes[name] = nextValue;
      view.dispatch({ effects: contentAttributes.reconfigure(EditorView.contentAttributes.of({ ...attributes })) });
    },
    addEventListener(type, callback, options) {
      eventTarget(type).addEventListener(type, callback, eventOptions(type, options));
    },
    removeEventListener(type, callback, options) {
      eventTarget(type).removeEventListener(type, callback, eventOptions(type, options));
    },
    destroy() {
      const hadFocus = view.hasFocus;
      textarea.value = view.state.doc.toString();
      view.destroy();
      view.dom.remove();
      textarea.hidden = wasHidden;
      if (hadFocus && !wasHidden) textarea.focus();
    },
  };
}
