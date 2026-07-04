import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'
import { useSettings } from '../hooks/useSettings'
import { qk } from '../api/queryKeys'

export default function RecurringNotifyModal({ onClose }: { onClose: () => void }) {
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  const [weekly, setWeekly] = useState(3)
  const [monthly, setMonthly] = useState(7)
  const [yearly, setYearly] = useState(14)
  const seeded = useRef(false)

  // モーダルを開いた時点の設定値で初期化。
  useEffect(() => {
    if (!settings || seeded.current) return
    seeded.current = true
    const days = settings.recurring_display_days || {}
    setWeekly(days.weekly ?? 3)
    setMonthly(days.monthly ?? 7)
    setYearly(days.yearly ?? 14)
  }, [settings])

  const save = async () => {
    try {
      await App.SaveSettings(
        main.SaveSettingsRequest.createFrom({
          recurring_display_days: {
            weekly: Number.isNaN(weekly) ? 0 : weekly,
            monthly: Number.isNaN(monthly) ? 0 : monthly,
            yearly: Number.isNaN(yearly) ? 0 : yearly,
          },
        }),
      )
      qc.invalidateQueries({ queryKey: qk.recurringPanel() })
      qc.invalidateQueries({ queryKey: qk.settings() })
      onClose()
    } catch (e) {
      alert((e as Error)?.message || '保存に失敗しました')
    }
  }

  return createPortal(
    <>
      <div
        className="td-modal-overlay td-modal-overlay-over-panel"
        style={{ display: 'block' }}
        onClick={onClose}
      />
      <div className="td-modal td-modal-over-panel" style={{ display: 'flex' }}>
        <div className="td-modal-header">
          <span className="td-modal-title"><i className="bi bi-gear" /> 定期タスクの通知設定</span>
          <button className="td-panel-close" onClick={onClose}><i className="bi bi-x-lg" /></button>
        </div>
        <div className="td-modal-body">
          <div className="td-field">
            <span className="td-label">期日の何日前から通知するか（周期種別ごと）</span>
          </div>
          <div className="td-field">
            <label className="td-label">週ごとのタスク</label>
            <input
              type="number"
              className="td-input td-input-sm"
              min={0}
              max={366}
              value={Number.isNaN(weekly) ? '' : weekly}
              onChange={(e) => setWeekly(parseInt(e.target.value, 10))}
            />
          </div>
          <div className="td-field">
            <label className="td-label">月ごとのタスク</label>
            <input
              type="number"
              className="td-input td-input-sm"
              min={0}
              max={366}
              value={Number.isNaN(monthly) ? '' : monthly}
              onChange={(e) => setMonthly(parseInt(e.target.value, 10))}
            />
          </div>
          <div className="td-field">
            <label className="td-label">年ごとのタスク</label>
            <input
              type="number"
              className="td-input td-input-sm"
              min={0}
              max={366}
              value={Number.isNaN(yearly) ? '' : yearly}
              onChange={(e) => setYearly(parseInt(e.target.value, 10))}
            />
          </div>
        </div>
        <div className="td-modal-footer">
          <button className="td-btn td-btn-secondary" onClick={onClose}>閉じる</button>
          <button className="td-btn td-btn-primary" onClick={save}><i className="bi bi-floppy" /> 保存</button>
        </div>
      </div>
    </>,
    document.body,
  )
}
