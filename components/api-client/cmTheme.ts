import { EditorView } from "@uiw/react-codemirror";

/** api-client 内 CodeMirror 的暗色主题，与 compare 编辑器风格一致。 */
export const cmTheme = EditorView.theme({
  "&": { background: "var(--bg-input) !important" },
  ".cm-content": { padding: "10px 0" },
  ".cm-line": { padding: "0 12px" },
  ".cm-gutters": {
    background: "var(--bg-input)",
    borderRight: "1px solid var(--border)",
    color: "var(--text-muted)",
  },
  ".cm-activeLineGutter": { background: "rgba(255,255,255,0.04)" },
  ".cm-activeLine": { background: "rgba(255,255,255,0.03)" },
  ".cm-selectionBackground": { background: "rgba(91,124,250,0.25) !important" },
  ".cm-cursor": { borderLeftColor: "var(--accent) !important" },
});
