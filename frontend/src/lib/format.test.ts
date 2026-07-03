import { describe, it, expect } from 'vitest'
import { fmtDeadline, previewText, normalizeLocalPath, computeReorder } from './format'

describe('fmtDeadline', () => {
  it('空文字は空を返す', () => expect(fmtDeadline('')).toBe(''))
  it('YYYY-MM-DD を M/D(曜) に整形する', () => {
    // 2026-07-03 は金曜
    expect(fmtDeadline('2026-07-03')).toBe('7/3(金)')
  })
  it('ローカル時刻で曜日を計算する（UTCずれで前日にならない）', () => {
    // 2026-01-01 は木曜
    expect(fmtDeadline('2026-01-01')).toBe('1/1(木)')
  })
})

describe('previewText', () => {
  it('単一行はそのまま', () => expect(previewText('買い物')).toBe('買い物'))
  it('複数行は1行目＋省略記号', () => expect(previewText('件名\n詳細')).toBe('件名　…'))
  it('null/undefined は空', () => expect(previewText(undefined as unknown as string)).toBe(''))
})

describe('normalizeLocalPath', () => {
  it('通常パスはそのまま', () =>
    expect(normalizeLocalPath('C:\\work\\a.txt')).toBe('C:\\work\\a.txt'))
  it('file:// を剥がして復号する', () =>
    expect(normalizeLocalPath('file:///C:/work/%E3%81%82.txt')).toBe('/C:/work/あ.txt'))
})

describe('computeReorder', () => {
  it('from を to の位置へ移動した新しい順序を返す', () => {
    expect(computeReorder([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3])
  })
  it('from か to が無ければ元の配列を返す', () => {
    expect(computeReorder([1, 2, 3], 9, 2)).toEqual([1, 2, 3])
  })
  it('to が見つからなければ元の配列を返す', () => {
    expect(computeReorder([1, 2, 3], 2, 9)).toEqual([1, 2, 3])
  })
})
