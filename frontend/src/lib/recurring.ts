const WEEKDAY_NAMES = ['月', '火', '水', '木', '金', '土', '日']

export type PeriodParts = {
  weekday: string // '0'..'6'（0=月）
  monthDay: number // 1..31
  yearMonth: number // 1..12
  yearDay: number // 1..31
}

// period_value をフォーム初期値へ分解する（別種別・空値はデフォルト）。
export function parsePeriodValue(periodType: string, periodValue: string): PeriodParts {
  const parts: PeriodParts = { weekday: '0', monthDay: 1, yearMonth: 1, yearDay: 1 }
  if (periodType === 'weekly') {
    parts.weekday = periodValue || '0'
  } else if (periodType === 'monthly') {
    parts.monthDay = parseInt(periodValue, 10) || 1
  } else if (periodType === 'yearly') {
    const [m, d] = (periodValue || '1-1').split('-')
    parts.yearMonth = parseInt(m, 10) || 1
    parts.yearDay = parseInt(d, 10) || 1
  }
  return parts
}

// フォーム入力から period_value 文字列を組み立てる（yearly は 0 埋め MM-DD）。
export function encodePeriodValue(periodType: string, parts: PeriodParts): string {
  if (periodType === 'weekly') return String(parts.weekday)
  if (periodType === 'monthly') return String(parts.monthDay)
  const m = String(parts.yearMonth).padStart(2, '0')
  const d = String(parts.yearDay).padStart(2, '0')
  return `${m}-${d}`
}

// 一覧のメタ表記（現行 _recurringMetaLabel と一致）。
export function recurringMetaLabel(t: { period_type: string; period_value: string; is_active: boolean }): string {
  const periodLabel: Record<string, string> = { weekly: '週ごと', monthly: '月ごと', yearly: '年ごと' }
  let meta = periodLabel[t.period_type] || t.period_type
  if (t.period_type === 'weekly') {
    meta += `（毎週${WEEKDAY_NAMES[parseInt(t.period_value, 10)] || t.period_value}曜）`
  } else if (t.period_type === 'monthly') {
    meta += `（毎月${t.period_value}日）`
  } else if (t.period_type === 'yearly') {
    const [m, d] = t.period_value.split('-')
    meta += `（毎年${parseInt(m, 10)}月${parseInt(d, 10)}日）`
  }
  if (!t.is_active) meta += '・停止中'
  return meta
}
