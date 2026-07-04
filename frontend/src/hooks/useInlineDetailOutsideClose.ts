import { useEffect } from 'react'
import { useUiStore } from '../state/uiStore'

// インライン展開の詳細フォーム（通常タスク／定期タスク）を、開いている行の外側を
// クリックしたら保存せずに閉じる（ドラフトは保持）。現行バニラ todo.js の
// 「インライン展開の詳細フォーム：空きスペースクリックで閉じる」region を移植。
// ドラッグでのテキスト選択による誤閉じを防ぐため mousedown で arm し click で判定。
export function useInlineDetailOutsideClose() {
  useEffect(() => {
    let armed = false
    const onDown = () => {
      armed = true
    }
    const onClick = (e: MouseEvent) => {
      if (!armed) return
      armed = false
      const s = useUiStore.getState()
      if (s.detailPattern !== 'inline') return
      const target = e.target as HTMLElement
      // 「＋」定期追加ボタン自体のクリックは対象外（新規フォームを開くトリガーで、
      // 開いた直後の同一クリックで即閉じてしまうのを防ぐ）。
      if (target.closest('[data-recurring-add]')) return

      // 通常タスクのインライン詳細
      if (s.openId != null) {
        const wrap = document.querySelector(`.td-row-wrap[data-id=\"${s.openId}\"]`)
        if (wrap && !wrap.contains(target)) s.setOpenId(null)
      }

      // 定期タスクのインライン詳細（パネル内クリックのみ扱う。パネル外クリックは
      // 既存のパネル overlay 側で閉じる）。
      if (s.recurringOpenId != null) {
        const panel = document.querySelector('.td-recurring-panel')
        if (panel && panel.contains(target)) {
          const rWrap =
            s.recurringOpenId === 'new'
              ? document.querySelector('[data-recurring-new]')
              : document.querySelector(`.td-recurring-row-wrap[data-id=\"${s.recurringOpenId}\"]`)
          if (rWrap && !rWrap.contains(target)) s.setRecurringOpenId(null)
        }
      }
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('click', onClick)
    }
  }, [])
}
