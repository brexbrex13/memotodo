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
import { api } from "./api";
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
  const [zoom, setZoom] = useState("");
  const upload = async (blob: Blob) => {
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
      onBusy?.(false);
    }
  };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      TextStyle,
      Color,
      Image,
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: DOMPurify.sanitize(value),
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
      editor.commands.setContent(DOMPurify.sanitize(value), {
        emitUpdate: false,
      });
  }, [value, editor]);
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
        <input
          aria-label="文字色"
          title="文字色"
          type="color"
          onInput={(e) =>
            editor.chain().focus().setColor(e.currentTarget.value).run()
          }
        />
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
              "リンク先（https://…）",
              editor.getAttributes("link").href ?? "",
            );
            if (href === null) return;
            if (!href) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            if (!/^https?:\/\//i.test(href)) {
              onError("HTTP/HTTPSリンクを入力してください");
              return;
            }
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href })
              .run();
          }}
        >
          リンク
        </button>
        <button type="button" onClick={() => file.current?.click()}>
          画像
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
      <EditorContent editor={editor} />
      <small>自動保存 · 画像は貼り付け・ドロップでも添付できます</small>
      {zoom && (
        <div className="lightbox" onClick={() => setZoom("")}>
          <button>閉じる</button>
          <img src={zoom} alt="添付画像の拡大" />
        </div>
      )}
    </div>
  );
}
