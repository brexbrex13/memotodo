import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import DOMPurify from "dompurify";
import { memoLink } from "./links";
import { api } from "./api";
const sanitizeMemo = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
export function Editor({
  value,
  onChange,
  onError,
  onBusy,
}: {
  value: string;
  onChange: (v: string) => void;
  onError: (e: unknown) => void;
  onBusy?: (v: boolean) => void;
}) {
  const change = useRef(onChange);
  change.current = onChange;
  const file = useRef<HTMLInputElement>(null);
  const uploads = useRef(0);
  const resize = useRef<HTMLDivElement>(null);
  const [height] = useState(() =>
    Math.max(
      140,
      Math.min(900, Number(localStorage.getItem("memo-height")) || 240),
    ),
  );

  const [zoom, setZoom] = useState("");
  const upload = async (blob: Blob) => {
    uploads.current++;
    onBusy?.(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const src = await api<string>("SaveImage", data);
      if (editor)
        editor
          .chain()
          .focus()
          .insertContentAt(editor.state.selection.to, {
            type: "image",
            attrs: { src },
          })
          .run();
    } catch (e) {
      onError(e);
    } finally {
      uploads.current--;
      onBusy?.(uploads.current > 0);
    }
  };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      TextStyle,
      Color,
      Image,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["file"],
        isAllowedUri: (url) => /^(https?:\/\/|file:\/\/)/i.test(url),
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: sanitizeMemo(value),
    onUpdate: ({ editor }) => change.current(editor.getHTML()),
    editorProps: {
      handlePaste: (_view, e) => {
        const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
          i.type.startsWith("image/"),
        );
        if (item) {
          const blob = item.getAsFile();
          if (blob) {
            void upload(blob);
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, e) => {
        const f = e.dataTransfer?.files[0];
        if (f?.type.startsWith("image/")) {
          void upload(f);
          return true;
        }
        return false;
      },
      handleClick: (_view, _pos, e) => {
        const el = e.target as HTMLElement;
        if (el.tagName === "IMG") {
          setZoom(el.getAttribute("src") ?? "");
          return true;
        }
        const a = el.closest("a");
        if (a) {
          void api("OpenURL", a.href).catch(onError);
          return true;
        }
        return false;
      },
    },
  });
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused)
      editor.commands.setContent(sanitizeMemo(value), {
        emitUpdate: false,
      });
  }, [value, editor]);
  useEffect(() => {
    const el = resize.current;
    if (!el) return;
    const persist = () =>
      localStorage.setItem(
        "memo-height",
        String(Math.round(el.getBoundingClientRect().height)),
      );
    el.addEventListener("pointerup", persist);
    const obs = new ResizeObserver(persist);
    obs.observe(el);
    return () => {
      el.removeEventListener("pointerup", persist);
      obs.disconnect();
    };
  }, [editor]);
  if (!editor) return null;
  return (
    <div className="memo">
      <div className="toolbar">
        <button
          type="button"
          title="太字 Ctrl+B"
          aria-pressed={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          title="斜体 Ctrl+I"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <div className="text-colors" role="group" aria-label="文字色">
          {[
            ["標準", "#302d25"],
            ["赤", "#b32929"],
            ["青", "#185caa"],
            ["緑", "#26713e"],
            ["紫", "#743c91"],
          ].map(([name, color]) => (
            <button
              key={name}
              type="button"
              aria-label={"文字色：" + name}
              data-tip={"文字色：" + name}
              style={{ color }}
              onClick={() => editor.chain().focus().setColor(color).run()}
            >
              A
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          見出し
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          箇条書き
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          チェック
        </button>
        <button
          type="button"
          onClick={() => {
            const href = prompt(
              "リンク先（HTTP/HTTPS、ローカル・UNCパス）",
              editor.getAttributes("link").href ?? "",
            );
            if (href === null) return;
            if (!href) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            let target: string;
            try {
              target = memoLink(href);
            } catch (e) {
              onError(e);
              return;
            }
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: target })
              .run();
          }}
        >
          リンク
        </button>
        <button
          type="button"
          data-tip="画像を本文に挿入します。Ctrl+V・ドロップでも添付できます"
          onClick={() => file.current?.click()}
        >
          画像添付
        </button>
        <button
          type="button"
          title="元に戻す Ctrl+Z"
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </button>
        <button
          type="button"
          title="やり直す"
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </button>
        <input
          ref={file}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="memo-editor" ref={resize} style={{ height }}>
        <EditorContent editor={editor} />
      </div>
      {zoom && (
        <div className="lightbox" onClick={() => setZoom("")}>
          <button>閉じる</button>
          <img src={zoom} alt="添付画像の拡大" />
        </div>
      )}
    </div>
  );
}
