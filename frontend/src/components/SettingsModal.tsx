import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'
import { useSettings } from '../hooks/useSettings'
import { useUiStore } from '../state/uiStore'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  const setDetailPattern = useUiStore((s) => s.setDetailPattern)
  const setOpenId = useUiStore((s) => s.setOpenId)

  const [pattern, setPattern] = useState<'inline' | 'modal'>('inline')
  const [times, setTimes] = useState<string[]>([])
  const [nearDays, setNearDays] = useState<number>(3)
  const [rToast, setRToast] = useState(true)
  const [rFront, setRFront] = useState(false)
  const [pToast, setPToast] = useState(true)
  const [pFront, setPFront] = useState(false)

  const seeded = useRef(false)

  // 現在の設定で初期化（モーダルを開いた時点の値を反映）
  useEffect(() => {
    if (!settings || seeded.current) return
    seeded.current = true
    setPattern(settings.detail_pattern === 'modal' ? 'modal' : 'inline')
    setTimes([...(settings.notify_times || [])])
    setNearDays(settings.todo_near_deadline_days ?? 3)
    setRToast(settings.reminder_notify_method?.toast ?? true)
    setRFront(settings.reminder_notify_method?.bring_to_front ?? false)
    setPToast(settings.periodic_notify_method?.toast ?? true)
    setPFront(settings.periodic_notify_method?.bring_to_front ?? false)
  }, [settings])

  const save = async () => {
    try {
      await App.SaveSettings(
        main.SaveSettingsRequest.createFrom({
          detail_pattern: pattern,
          notify_times: times,
          todo_near_deadline_days: Number.isNaN(nearDays) ? 0 : nearDays,
          reminder_notify_method: { toast: rToast, bring_to_front: rFront },
          periodic_notify_method: { toast: pToast, bring_to_front: pFront },
        }),
      )
      setDetailPattern(pattern)
      setOpenId(null) // モード切替時に開きっぱなしの詳細を閉じて中途半端な状態を避ける
      qc.invalidateQueries({ queryKey: ['settings'] })
      onClose()
    } catch (e) {
      alert((e as Error)?.message || '保存に失敗しました')
    }
  }

  return createPortal(
    <>
      <div className="td-modal-overlay" style={{ display: 'block' }} onClick={onClose} />
      <div className="td-modal td-modal-settings" style={{ display: 'flex' }}>
        <div className="td-modal-header">
          <span className="td-modal-title"><i className="bi bi-gear" /> 設定</span>
          <button className="td-panel-close" onClick={onClose}><i className="bi bi-x-lg" /></button>
        </div>
        <div className="td-modal-body">
          <div className="td-field">
            <label className="td-label">詳細設定の表示方式</label>
            <div className="td-segmented">
              {(['inline', 'modal'] as const).map((v) => (
                <button key={v} type="button"
                  className={`td-segmented-btn ${pattern === v ? 'active' : ''}`}
                  onClick={() => setPattern(v)}>
                  {v === 'inline' ? 'インライン' : 'モーダル'}
                </button>
              ))}
            </div>
          </div>

          <div className="td-field">
            <label className="td-label">定期通知の時刻</label>
            <div className="td-notify-times">
              {times.map((t, i) => (
                <div className="td-notify-time-row" key={i}>
                  <input type="time" className="td-input" value={t}
                    onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} />
                  <button type="button" className="td-icon-btn" title="削除"
                    onClick={() => setTimes(times.filter((_, j) => j !== i))}><i className="bi bi-x" /></button>
                </div>
              ))}
            </div>
            <button type="button" className="td-btn td-btn-ghost td-btn-sm"
              onClick={() => setTimes([...times, '09:00'])}><i className="bi bi-plus" /> 時刻を追加</button>
          </div>

          <div className="td-field">
            <label className="td-label">通常タスク：期日の何日前から通知するか（営業日）</label>
            <input type="number" className="td-input td-input-sm" min={0} max={366}
              value={Number.isNaN(nearDays) ? '' : nearDays}
              onChange={(e) => setNearDays(parseInt(e.target.value, 10))} />
          </div>

          <div className="td-field">
            <label className="td-label">通知方式（併用可・両方OFFならアプリ内表示のみ）</label>
            <div className="td-notify-method-grid">
              <span />
              <span className="td-notify-method-col-label">Windows通知</span>
              <span className="td-notify-method-col-label">最前面に表示</span>

              <span className="td-notify-method-row-label">リマインダー</span>
              <label className="td-checkbox-inline"><input type="checkbox" checked={rToast} onChange={(e) => setRToast(e.target.checked)} /></label>
              <label className="td-checkbox-inline"><input type="checkbox" checked={rFront} onChange={(e) => setRFront(e.target.checked)} /></label>

              <span className="td-notify-method-row-label">定期通知</span>
              <label className="td-checkbox-inline"><input type="checkbox" checked={pToast} onChange={(e) => setPToast(e.target.checked)} /></label>
              <label className="td-checkbox-inline"><input type="checkbox" checked={pFront} onChange={(e) => setPFront(e.target.checked)} /></label>
            </div>
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
