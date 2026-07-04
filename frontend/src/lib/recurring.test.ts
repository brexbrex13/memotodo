import { describe, it, expect } from 'vitest'
import { parsePeriodValue, encodePeriodValue, recurringMetaLabel } from './recurring'

describe('parsePeriodValue', () => {
  it('weekly は曜日 index を返す', () =>
    expect(parsePeriodValue('weekly', '3')).toEqual({ weekday: '3', monthDay: 1, yearMonth: 1, yearDay: 1 }))
  it('monthly は日を数値で返す', () =>
    expect(parsePeriodValue('monthly', '15')).toEqual({ weekday: '0', monthDay: 15, yearMonth: 1, yearDay: 1 }))
  it('yearly は MM-DD を月日に分解する', () =>
    expect(parsePeriodValue('yearly', '07-03')).toEqual({ weekday: '0', monthDay: 1, yearMonth: 7, yearDay: 3 }))
  it('空値はデフォルトを返す', () =>
    expect(parsePeriodValue('weekly', '')).toEqual({ weekday: '0', monthDay: 1, yearMonth: 1, yearDay: 1 }))
})

describe('encodePeriodValue', () => {
  const base = { weekday: '2', monthDay: 15, yearMonth: 7, yearDay: 3 }
  it('weekly は曜日文字列', () => expect(encodePeriodValue('weekly', base)).toBe('2'))
  it('monthly は日文字列', () => expect(encodePeriodValue('monthly', base)).toBe('15'))
  it('yearly は 0 埋め MM-DD', () => expect(encodePeriodValue('yearly', base)).toBe('07-03'))
})

describe('recurringMetaLabel', () => {
  it('weekly は曜日名', () =>
    expect(recurringMetaLabel({ period_type: 'weekly', period_value: '0', is_active: true })).toBe('週ごと（毎週月曜）'))
  it('monthly は日', () =>
    expect(recurringMetaLabel({ period_type: 'monthly', period_value: '15', is_active: true })).toBe('月ごと（毎月15日）'))
  it('yearly は月日', () =>
    expect(recurringMetaLabel({ period_type: 'yearly', period_value: '07-03', is_active: true })).toBe('年ごと（毎年7月3日）'))
  it('停止中は接尾辞が付く', () =>
    expect(recurringMetaLabel({ period_type: 'weekly', period_value: '1', is_active: false })).toBe('週ごと（毎週火曜）・停止中'))
})
