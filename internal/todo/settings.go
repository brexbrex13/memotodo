package todo

import (
	"encoding/json"
	"os"
)

// DefaultNotifyTimes は todo_settings.json が存在しない場合のフォールバック。
var DefaultNotifyTimes = []string{"13:00", "17:00"}

func defaultSettings() Settings {
	return Settings{
		NotifyTimes:   append([]string{}, DefaultNotifyTimes...),
		DetailPattern: "inline",
		RecurringDisplayDays: map[string]int{
			"weekly":  3,
			"monthly": 7,
			"yearly":  14,
		},
		TodoNearDeadlineDays: DefaultNearDeadlineWorkdays,
		// 既定はアプリ内トースト＋Windowsトースト。ウィンドウの前面化は
		// 画面を占有して邪魔になりうるため既定OFF（ユーザーが選んでONにする）。
		ReminderNotifyMethod: NotifyMethod{Toast: true, BringToFront: false},
		PeriodicNotifyMethod: NotifyMethod{Toast: true, BringToFront: false},
		ImageOpenMethod:      "inapp",
		CollapsedCategories:  []int64{},
	}
}

// LoadSettings は設定JSONを読み込んで返す。欠けているキーはデフォルト値で補完する。
func (s *Store) LoadSettings() (Settings, error) {
	def := defaultSettings()

	data, err := os.ReadFile(s.settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return def, nil
		}
		return def, nil // 読み込み失敗時はデフォルト値を使用する
	}

	var raw struct {
		NotifyTimes          []string       `json:"notify_times"`
		DetailPattern        string         `json:"detail_pattern"`
		RecurringDisplayDays map[string]int `json:"recurring_display_days"`
		TodoNearDeadlineDays int            `json:"todo_near_deadline_days"`
		ReminderNotifyMethod *NotifyMethod  `json:"reminder_notify_method"`
		PeriodicNotifyMethod *NotifyMethod  `json:"periodic_notify_method"`
		ImageOpenMethod      string         `json:"image_open_method"`
		CollapsedCategories  []int64        `json:"collapsed_categories"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return def, nil
	}

	merged := def
	if raw.NotifyTimes != nil {
		merged.NotifyTimes = raw.NotifyTimes
	}
	if raw.DetailPattern != "" {
		merged.DetailPattern = raw.DetailPattern
	}
	for k, v := range raw.RecurringDisplayDays {
		merged.RecurringDisplayDays[k] = v
	}
	if raw.TodoNearDeadlineDays > 0 {
		merged.TodoNearDeadlineDays = raw.TodoNearDeadlineDays
	}
	if raw.ReminderNotifyMethod != nil {
		merged.ReminderNotifyMethod = *raw.ReminderNotifyMethod
	}
	if raw.PeriodicNotifyMethod != nil {
		merged.PeriodicNotifyMethod = *raw.PeriodicNotifyMethod
	}
	if raw.ImageOpenMethod != "" {
		merged.ImageOpenMethod = raw.ImageOpenMethod
	}
	if raw.CollapsedCategories != nil {
		merged.CollapsedCategories = raw.CollapsedCategories
	}
	return merged, nil
}

// SettingsUpdate は設定の部分更新に使うフィールド（nilなら未指定）。
type SettingsUpdate struct {
	NotifyTimes          []string
	DetailPattern        *string
	RecurringDisplayDays map[string]int
	TodoNearDeadlineDays *int
	ReminderNotifyMethod *NotifyMethod
	PeriodicNotifyMethod *NotifyMethod
	ImageOpenMethod      *string
	CollapsedCategories  []int64
}

// SaveSettings は設定を保存する（既存設定にマージ）。
func (s *Store) SaveSettings(u SettingsUpdate) (Settings, error) {
	current, err := s.LoadSettings()
	if err != nil {
		return Settings{}, err
	}
	if u.NotifyTimes != nil {
		current.NotifyTimes = u.NotifyTimes
	}
	if u.DetailPattern != nil {
		current.DetailPattern = *u.DetailPattern
	}
	for k, v := range u.RecurringDisplayDays {
		current.RecurringDisplayDays[k] = v
	}
	if u.TodoNearDeadlineDays != nil {
		current.TodoNearDeadlineDays = *u.TodoNearDeadlineDays
	}
	if u.ReminderNotifyMethod != nil {
		current.ReminderNotifyMethod = *u.ReminderNotifyMethod
	}
	if u.PeriodicNotifyMethod != nil {
		current.PeriodicNotifyMethod = *u.PeriodicNotifyMethod
	}
	if u.ImageOpenMethod != nil {
		current.ImageOpenMethod = *u.ImageOpenMethod
	}
	if u.CollapsedCategories != nil {
		current.CollapsedCategories = u.CollapsedCategories
	}

	data, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return Settings{}, err
	}
	if err := os.WriteFile(s.settingsPath, data, 0o644); err != nil {
		return Settings{}, err
	}
	return current, nil
}
