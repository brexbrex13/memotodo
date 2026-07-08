package todo

// Todo は1件のメモを表す。
// title: 本文（複数行可・必須）, memo: 詳細メモ（HTML・任意）
type Todo struct {
	ID              int64  `json:"id"`
	Title           string `json:"title"`
	Memo            string `json:"memo"`
	Status          string `json:"status"` // "pending" | "done"
	Deadline        string `json:"deadline"`
	ReminderEnabled bool   `json:"reminder_enabled"`
	ReminderAt      string `json:"reminder_at"`
	Reminded        bool   `json:"reminded"`
	CreatedAt       string `json:"created_at"`
	DoneAt          string `json:"done_at"`
	IsImportant     bool   `json:"is_important"`
	SortOrder       int64  `json:"sort_order"`
	IsOverdue       bool   `json:"is_overdue"`
	IsNear          bool   `json:"is_near"`
	Links           []Link `json:"links,omitempty"`
}

// Link はメモ本文から検出したURL/パスを表す。
type Link struct {
	Type  string `json:"type"` // "url" | "path"
	Value string `json:"value"`
}

// RecurringTask は定期タスク定義を表す（1レコード方式：current_deadline/status を使い回す）。
type RecurringTask struct {
	ID              int64  `json:"id"`
	Title           string `json:"title"`
	Memo            string `json:"memo"`
	PeriodType      string `json:"period_type"`  // "weekly" | "monthly" | "yearly"
	PeriodValue     string `json:"period_value"` // weekly:'0'-'6', monthly:'1'-'31', yearly:'MM-DD'
	CurrentDeadline string `json:"current_deadline"`
	Status          string `json:"status"` // "pending" | "done"（現周期の完了/未完了）
	DoneAt          string `json:"done_at"`
	IsActive        bool   `json:"is_active"`
	CreatedAt       string `json:"created_at"`
	Freq            string `json:"freq,omitempty"`
	IsOverdue       bool   `json:"is_overdue,omitempty"`
}

// Settings はアプリ全体の設定。
type Settings struct {
	NotifyTimes          []string       `json:"notify_times"`
	DetailPattern        string         `json:"detail_pattern"` // "inline" | "modal"
	RecurringDisplayDays map[string]int `json:"recurring_display_days"`
	// TodoNearDeadlineDays は通常メモの「期日が近い」判定に使う営業日数のしきい値。
	TodoNearDeadlineDays int `json:"todo_near_deadline_days"`
	// 通知の出し方（アプリ内トーストは常時表示される土台の挙動で、
	// これに加えて Windows トースト／ウィンドウ前面化を個別にON/OFFできる。
	// 両方OFFなら「アプリ内のみ」になる）。
	ReminderNotifyMethod NotifyMethod `json:"reminder_notify_method"`
	PeriodicNotifyMethod NotifyMethod `json:"periodic_notify_method"`
	// メモの画像をクリックしたときの開き方。"inapp"（アプリ内ライトボックス）| "system"（OS標準の画像ビューワ）。
	ImageOpenMethod string `json:"image_open_method"`
}

// NotifyMethod は通知の出し方（アプリ内トーストとの併用可否）。
type NotifyMethod struct {
	Toast        bool `json:"toast"`          // Windows のアクションセンター通知も出す
	BringToFront bool `json:"bring_to_front"` // メインウィンドウを前面に表示する
}

// RecurringPanelData は定期タスクパネル表示用のデータ。
type RecurringPanelData struct {
	Overdue []RecurringTask `json:"overdue"`
	Current []RecurringTask `json:"current"`
	Badge   RecurringBadge  `json:"badge"`
}

type RecurringBadge struct {
	Current int `json:"current"`
	Overdue int `json:"overdue"`
}

// TodoUpdate はメモの部分更新に使うフィールド（nilなら未指定）。
type TodoUpdate struct {
	Title           *string `json:"title,omitempty"`
	Memo            *string `json:"memo,omitempty"`
	Deadline        *string `json:"deadline,omitempty"`
	ReminderEnabled *bool   `json:"reminder_enabled,omitempty"`
	ReminderAt      *string `json:"reminder_at,omitempty"`
	Reminded        *bool   `json:"reminded,omitempty"`
	Status          *string `json:"status,omitempty"`
	DoneAt          *string `json:"done_at,omitempty"`
	IsImportant     *bool   `json:"is_important,omitempty"`
}

// RecurringTaskUpdate は定期タスク定義の部分更新に使うフィールド。
type RecurringTaskUpdate struct {
	Title       *string `json:"title,omitempty"`
	Memo        *string `json:"memo,omitempty"`
	PeriodType  *string `json:"period_type,omitempty"`
	PeriodValue *string `json:"period_value,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
}
