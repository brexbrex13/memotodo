const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// "YYYY-MM-DD" -> "M/D(曜)". 曜日はローカル時刻の new Date(y, m-1, d) で求める
// （Date.parse("YYYY-MM-DD") は UTC 扱いになり時差で前日にずれるため使わない）。
export function fmtDeadline(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${m}/${d}(${wd})`
}

export function previewText(text: string): string {
  const lines = String(text ?? '').split('\n')
  return lines[0] + (lines.length > 1 ? '　…' : '')
}

// リンク一覧のローカルパスクリック時の正規化（現行 _renderLinks と同じ挙動）
export function normalizeLocalPath(path: string): string {
  return path.startsWith('file://') ? decodeURIComponent(path.slice(7)) : path
}

// ドラッグ並び替え後の新しい id 順序を返す（fromId を toId の位置へ挿入）
export function computeReorder(ids: number[], fromId: number, toId: number): number[] {
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0) return ids
  const next = ids.slice()
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}
