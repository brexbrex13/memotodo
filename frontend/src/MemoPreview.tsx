import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { sanitizeMemo } from "./memo";

export function MemoPreview({
  value,
  onError,
}: {
  value: string;
  onError: (error: unknown) => void;
}) {
  const [zoom, setZoom] = useState("");
  const close = useRef<HTMLButtonElement>(null);
  const imageFocus = useRef<HTMLElement | null>(null);
  const html = useMemo(() => {
    const template = document.createElement("template");
    template.innerHTML = sanitizeMemo(value);
    template.content
      .querySelectorAll("form,button,select,textarea")
      .forEach((el) => el.remove());
    template.content.querySelectorAll("input").forEach((el) => {
      el.disabled = true;
    });
    template.content
      .querySelectorAll("[contenteditable]")
      .forEach((el) => el.removeAttribute("contenteditable"));
    template.content.querySelectorAll("img").forEach((el) => {
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", "添付画像を拡大");
    });
    return template.innerHTML;
  }, [value]);
  useEffect(() => {
    if (!zoom) return;
    close.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setZoom("");
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      imageFocus.current?.focus({ preventScroll: true });
    };
  }, [zoom]);
  return (
    <>
      <div
        className="notice-memo"
        aria-label="通知のメモ"
        onClick={(e) => {
          const el = e.target as HTMLElement;
          const link = el.closest("a");
          if (link) {
            e.preventDefault();
            void api("OpenURL", link.href).catch(onError);
          } else if (el.tagName === "IMG") {
            imageFocus.current = el;
            setZoom(el.getAttribute("src") ?? "");
          }
        }}
        onKeyDown={(e) => {
          const el = e.target as HTMLElement;
          if (el.tagName === "IMG" && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            el.click();
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {zoom && (
        <div
          className="lightbox notice-lightbox"
          role="dialog"
          aria-label="添付画像の拡大"
          aria-modal="true"
          onClick={() => setZoom("")}
        >
          <button
            ref={close}
            aria-label="画像の拡大を閉じる"
            onClick={() => setZoom("")}
          >
            閉じる
          </button>
          <img src={zoom} alt="添付画像の拡大" />
        </div>
      )}
    </>
  );
}
