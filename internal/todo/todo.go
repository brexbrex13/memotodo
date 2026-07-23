package todo

import (
	"database/sql"
	"errors"
	"time"
)

func nowISO() string {
	return time.Now().Format("2006-01-02T15:04:05")
}

func scanTodo(row interface {
	Scan(dest ...interface{}) error
}) (Todo, error) {
	var t Todo
	var deadline, reminderAt, doneAt sql.NullString
	var categoryID sql.NullInt64
	var reminderEnabled, reminded, isImportant int
	err := row.Scan(
		&t.ID, &t.Title, &t.Memo, &t.Status, &deadline,
		&reminderEnabled, &reminderAt, &reminded,
		&t.CreatedAt, &doneAt, &isImportant, &t.SortOrder, &categoryID,
	)
	if err != nil {
		return Todo{}, err
	}
	t.Deadline = deadline.String
	t.ReminderAt = reminderAt.String
	t.DoneAt = doneAt.String
	t.ReminderEnabled = reminderEnabled != 0
	t.Reminded = reminded != 0
	t.IsImportant = isImportant != 0
	if categoryID.Valid {
		t.CategoryID = &categoryID.Int64
	}
	return t, nil
}

const todoColumns = `id, title, memo, status, deadline, reminder_enabled, reminder_at, reminded, created_at, done_at, is_important, sort_order, category_id`

// GetTodos はメモ一覧を返す。並び順：期日なし→期日あり。
// 期日なしは sort_order 昇順（手動並び替え）、期日ありは期日昇順。
func (s *Store) GetTodos(status string) ([]Todo, error) {
	rows, err := s.db.Query(
		`SELECT `+todoColumns+` FROM todos WHERE status = ?
		 ORDER BY (deadline IS NOT NULL), sort_order ASC, deadline ASC, created_at ASC`,
		status,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	nearDays := s.nearDeadlineWorkdays()

	var result []Todo
	for rows.Next() {
		t, err := scanTodo(rows)
		if err != nil {
			return nil, err
		}
		attachFlags(&t, nearDays)
		result = append(result, t)
	}
	return result, rows.Err()
}

// GetTodo は単一メモを返す。存在しない場合は ok=false。
func (s *Store) GetTodo(id int64) (Todo, bool, error) {
	row := s.db.QueryRow(`SELECT `+todoColumns+` FROM todos WHERE id = ?`, id)
	t, err := scanTodo(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Todo{}, false, nil
	}
	if err != nil {
		return Todo{}, false, err
	}
	attachFlags(&t, s.nearDeadlineWorkdays())
	return t, true, nil
}

// nearDeadlineWorkdays はユーザー設定の「期日が近い」しきい値（営業日数）を返す。
// 設定が読めない場合はデフォルト値にフォールバックする。
func (s *Store) nearDeadlineWorkdays() int {
	settings, err := s.LoadSettings()
	if err != nil || settings.TodoNearDeadlineDays <= 0 {
		return DefaultNearDeadlineWorkdays
	}
	return settings.TodoNearDeadlineDays
}

// CreateTodoInput は新規メモ登録の入力値。
type CreateTodoInput struct {
	Title           string
	Memo            string
	Deadline        string
	ReminderEnabled bool
	ReminderAt      string
	IsImportant     bool
	// CategoryID は所属カテゴリ（0=通常タスク）。
	CategoryID int64
}

// CreateTodo はメモを登録して新規IDを返す。
// 期日なしメモは常にリストの先頭に来るよう、既存の最小 sort_order より小さい値を割り当てる。
func (s *Store) CreateTodo(in CreateTodoInput) (int64, error) {
	var minOrder sql.NullInt64
	if err := s.db.QueryRow(`SELECT MIN(sort_order) FROM todos`).Scan(&minOrder); err != nil {
		return 0, err
	}
	nextOrder := int64(0)
	if minOrder.Valid {
		nextOrder = minOrder.Int64 - 1
	}

	res, err := s.db.Exec(
		`INSERT INTO todos (title, memo, deadline, reminder_enabled, reminder_at, is_important, sort_order, created_at, category_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.Title, in.Memo, nullIfEmpty(in.Deadline), boolToInt(in.ReminderEnabled), nullIfEmpty(in.ReminderAt),
		boolToInt(in.IsImportant), nextOrder, nowISO(), nullIfZero(in.CategoryID),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// nullIfZero は 0（=通常タスク／カテゴリなしのセンチネル）を NULL に変換する。
func nullIfZero(id int64) interface{} {
	if id == 0 {
		return nil
	}
	return id
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// UpdateTodo はメモの任意カラムを更新する。更新対象がなければ ok=false。
func (s *Store) UpdateTodo(id int64, u TodoUpdate) (bool, error) {
	set := ""
	args := []interface{}{}
	add := func(col string, val interface{}) {
		if set != "" {
			set += ", "
		}
		set += col + " = ?"
		args = append(args, val)
	}

	if u.Title != nil {
		add("title", *u.Title)
	}
	if u.Memo != nil {
		add("memo", *u.Memo)
	}
	if u.Deadline != nil {
		add("deadline", nullIfEmpty(*u.Deadline))
	}
	if u.ReminderEnabled != nil {
		add("reminder_enabled", boolToInt(*u.ReminderEnabled))
	}
	if u.ReminderAt != nil {
		add("reminder_at", nullIfEmpty(*u.ReminderAt))
		// リマインダー時刻を変更した場合は通知済みフラグをリセットして再通知できるようにする
		add("reminded", 0)
	}
	if u.Reminded != nil {
		add("reminded", boolToInt(*u.Reminded))
	}
	if u.Status != nil {
		add("status", *u.Status)
	}
	if u.DoneAt != nil {
		add("done_at", nullIfEmpty(*u.DoneAt))
	}
	if u.IsImportant != nil {
		add("is_important", boolToInt(*u.IsImportant))
	}
	if u.CategoryID != nil {
		add("category_id", nullIfZero(*u.CategoryID))
	}

	if set == "" {
		return false, nil
	}
	args = append(args, id)
	res, err := s.db.Exec(`UPDATE todos SET `+set+` WHERE id = ?`, args...)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// ReorderTodos は期日なしメモのドラッグ&ドロップ並び替え。渡された順に sort_order を振り直す。
func (s *Store) ReorderTodos(idOrder []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare(`UPDATE todos SET sort_order = ? WHERE id = ?`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for i, id := range idOrder {
		if _, err := stmt.Exec(i, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// CompleteTodo はメモを完了状態にする。
func (s *Store) CompleteTodo(id int64) (bool, error) {
	now := nowISO()
	res, err := s.db.Exec(`UPDATE todos SET status = 'done', done_at = ? WHERE id = ?`, now, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// DeleteTodo はメモを削除する。
func (s *Store) DeleteTodo(id int64) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM todos WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// DeleteAllDoneTodos は完了済みメモをすべて削除する。削除件数を返す。
func (s *Store) DeleteAllDoneTodos() (int64, error) {
	res, err := s.db.Exec(`DELETE FROM todos WHERE status = 'done'`)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// GetNearOrOverdueMemos は定期通知の対象メモを返す（期日が近い、または期日超過）。
// リマインダー設定の有無は問わない。
func (s *Store) GetNearOrOverdueMemos() ([]Todo, error) {
	todos, err := s.GetTodos("pending")
	if err != nil {
		return nil, err
	}
	var result []Todo
	for _, t := range todos {
		if t.Deadline != "" && (t.IsOverdue || t.IsNear) {
			result = append(result, t)
		}
	}
	return result, nil
}
