import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { App } from '../api/client'

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

export default function RichTextEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      // 保存済みメモ内・貼付後のリンクは既定ブラウザで開く（現行 _wireExternalLinkOpeners 相当）
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const a = (event.target as HTMLElement)?.closest('a[href]')
        if (a) {
          event.preventDefault()
          App.OpenURL(a.getAttribute('href') || '').catch(() => {})
          return true
        }
        return false
      },
      // クリップボード画像の貼付 → SaveImage → 画像ノード挿入
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items || [])
        const img = items.find((it) => it.type.startsWith('image/'))
        if (!img) return false
        const blob = img.getAsFile()
        if (!blob) return false
        event.preventDefault()
        blobToDataUrl(blob)
          .then((dataUrl) => App.SaveImage(dataUrl))
          .then((src) => editor?.chain().focus().setImage({ src }).run())
          .catch(() => alert('画像の保存に失敗しました'))
        return true
      },
    },
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
  }, [editor, value])

  const insertImageFromClipboard = async () => {
    try {
      const clipItems = await navigator.clipboard.read()
      for (const it of clipItems) {
        const type = it.types.find((t) => t.startsWith('image/'))
        if (type) {
          const blob = await it.getType(type)
          const dataUrl = await blobToDataUrl(blob)
          const src = await App.SaveImage(dataUrl)
          editor?.chain().focus().setImage({ src }).run()
          return
        }
      }
      alert('クリップボードに画像がありません')
    } catch {
      alert('クリップボードへのアクセスに失敗しました')
    }
  }

  const addLink = () => {
    const prev = editor?.getAttributes('link').href as string | undefined
    const url = prompt('URLを入力:', prev || 'https://')
    if (url == null) return
    if (url === '') editor?.chain().focus().unsetLink().run()
    else editor?.chain().focus().setLink({ href: url }).run()
  }

  if (!editor) return null

  return (
    <div className="td-editor-wrap">
      <div className="td-editor-toolbar">
        <button className="td-editor-btn" type="button" title="太字 (Ctrl+B)"
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}><b>B</b></button>
        <button className="td-editor-btn" type="button" title="赤文字"
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor('#CC0000').run() }}>
          <span style={{ color: '#CC0000', fontWeight: 700, fontSize: 12 }}>赤</span></button>
        <button className="td-editor-btn" type="button" title="リンク挿入"
          onMouseDown={(e) => { e.preventDefault(); addLink() }}><i className="bi bi-link-45deg" /></button>
        <div className="td-editor-sep" />
        <button className="td-editor-btn" type="button" title="クリップボードから画像を貼り付け"
          onMouseDown={(e) => { e.preventDefault(); insertImageFromClipboard() }}><i className="bi bi-image" /></button>
      </div>
      <EditorContent editor={editor} className="td-editor" />
    </div>
  )
}
