import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { promptDialog } from "./Dialogs";

/**
 * A text editor with simple formatting: bold, italic, underline, strikethrough, bulleted and numbered lists, quotes
 * and links (plus the usual shortcuts: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z ...). onChange gets the HTML and the plain
 * text; the server cleans the HTML again before keeping it.
 *
 * It starts empty and isn't controlled: to clear it (after sending), give it a new `key`.
 */
export function RichTextEditor({
  id,
  onChange,
  placeholder,
  ariaLabel,
  className = "",
}: {
  id?: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  // The editor is created once; these refs let it see the latest placeholder and onChange (e.g. after switching
  // between a reply and an internal note) without being rebuilt and losing what was typed.
  const placeholderRef = useRef(placeholder ?? "");
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    placeholderRef.current = placeholder ?? "";
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    // Rendered in the browser only (no flash of a server-rendered editor).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", protocols: ["mailto", "tel"] },
      }),
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
    ],
    editorProps: {
      attributes: {
        class: "rte-content",
        role: "textbox",
        "aria-multiline": "true",
        ...(id ? { id } : {}),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText({ blockSeparator: "\n\n" }).trim();
      onChangeRef.current(text ? editor.getHTML() : "", text);
    },
  });

  // Shows the new placeholder and label straight away when they change.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    if (ariaLabel) dom.setAttribute("aria-label", ariaLabel);
    else dom.removeAttribute("aria-label");
    editor.view.dispatch(editor.state.tr.setMeta("placeholder-changed", true));
  }, [editor, ariaLabel, placeholder]);

  return (
    <div className={`rte ${className}`.trim()}>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  // Re-renders the buttons when the selection's formatting changes (not on every keystroke).
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  async function editLink() {
    const current = (editor.getAttributes("link").href as string | undefined) ?? "";
    const entered = await promptDialog({
      title: current ? "Edit link" : "Add a link",
      message: "The web address, email address or phone number to link to. Leave it blank to remove the link.",
      label: "Link",
      defaultValue: current,
      placeholder: "https://example.com",
      confirmLabel: "Apply",
    });
    if (entered === null) return editor.commands.focus();
    const value = entered.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!value) return chain.unsetLink().run();
    const href = /^(https?:|mailto:|tel:)/i.test(value) ? value : value.includes("@") && !value.includes("/") ? `mailto:${value}` : /^\+?[\d\s()-]{6,}$/.test(value) ? `tel:${value.replace(/[^\d+]/g, "")}` : `https://${value}`;
    // With nothing selected, the address itself becomes the link text.
    if (editor.state.selection.empty && !s.link) return chain.insertContent({ type: "text", text: value, marks: [{ type: "link", attrs: { href } }] }).run();
    return chain.setLink({ href }).run();
  }

  const btn = (label: string, title: string, active: boolean, run: () => unknown, content: ReactNode, disabled = false) => (
    <button
      type="button"
      className={`rte-btn${active ? " is-active" : ""}`}
      aria-label={label}
      title={title}
      aria-pressed={active}
      disabled={disabled}
      // Keeps the text selected while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void run()}
    >
      {content}
    </button>
  );

  return (
    <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
      {btn("Bold", "Bold (Ctrl+B)", s.bold, () => editor.chain().focus().toggleBold().run(), <strong>B</strong>)}
      {btn("Italic", "Italic (Ctrl+I)", s.italic, () => editor.chain().focus().toggleItalic().run(), <em>I</em>)}
      {btn("Underline", "Underline (Ctrl+U)", s.underline, () => editor.chain().focus().toggleUnderline().run(), <u>U</u>)}
      {btn("Strikethrough", "Strikethrough", s.strike, () => editor.chain().focus().toggleStrike().run(), <s>S</s>)}
      <span className="rte-sep" aria-hidden="true" />
      {btn("Bulleted list", "Bulleted list", s.bullet, () => editor.chain().focus().toggleBulletList().run(), <ListIcon />)}
      {btn("Numbered list", "Numbered list", s.ordered, () => editor.chain().focus().toggleOrderedList().run(), <NumberedIcon />)}
      {btn("Quote", "Quote", s.quote, () => editor.chain().focus().toggleBlockquote().run(), <span aria-hidden="true">❝</span>)}
      {btn(s.link ? "Edit link" : "Add a link", s.link ? "Edit link" : "Add a link", s.link, editLink, <LinkIcon />)}
      <span className="rte-sep" aria-hidden="true" />
      {btn("Undo", "Undo (Ctrl+Z)", false, () => editor.chain().focus().undo().run(), <span aria-hidden="true">↶</span>, !s.canUndo)}
      {btn("Redo", "Redo (Ctrl+Y)", false, () => editor.chain().focus().redo().run(), <span aria-hidden="true">↷</span>, !s.canRedo)}
    </div>
  );
}

const icon = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, "aria-hidden": true };
const ListIcon = () => (
  <svg {...icon}><path d="M6 4h8M6 8h8M6 12h8" /><circle cx="2.5" cy="4" r="0.9" fill="currentColor" /><circle cx="2.5" cy="8" r="0.9" fill="currentColor" /><circle cx="2.5" cy="12" r="0.9" fill="currentColor" /></svg>
);
const NumberedIcon = () => (
  <svg {...icon}><path d="M6 4h8M6 8h8M6 12h8" /><text x="0.5" y="6" fontSize="5" fill="currentColor" stroke="none">1</text><text x="0.5" y="14" fontSize="5" fill="currentColor" stroke="none">2</text></svg>
);
const LinkIcon = () => (
  <svg {...icon}><path d="M6.5 9.5l3-3" /><path d="M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" /></svg>
);
