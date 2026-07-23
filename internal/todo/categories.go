package todo

import (
	"database/sql"
	"errors"
)

const categoryColumns = `id, name, color, sort_order, created_at`

func scanCategory(row interface {
	Scan(dest ...interface{}) error
}) (Category, error) {
	var c Category
	if err := row.Scan(&c.ID, &c.Name, &c.Color, &c.SortOrder, &c.CreatedAt); err != nil {
		return Category{}, err
	}
	return c, nil
}

// GetCategories はカテゴリ一覧を sort_order 順で返す。
func (s *Store) GetCategories() ([]Category, error) {
	rows, err := s.db.Query(`SELECT ` + categoryColumns + ` FROM categories ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []Category
	for rows.Next() {
		c, err := scanCategory(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

// CreateCategory はカテゴリを登録して新規IDを返す。既存の最大 sort_order の次に置く。
func (s *Store) CreateCategory(name, color string) (int64, error) {
	var maxOrder sql.NullInt64
	if err := s.db.QueryRow(`SELECT MAX(sort_order) FROM categories`).Scan(&maxOrder); err != nil {
		return 0, err
	}
	nextOrder := int64(0)
	if maxOrder.Valid {
		nextOrder = maxOrder.Int64 + 1
	}

	res, err := s.db.Exec(
		`INSERT INTO categories (name, color, sort_order, created_at) VALUES (?, ?, ?, ?)`,
		name, color, nextOrder, nowISO(),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdateCategory はカテゴリの任意カラムを更新する。更新対象がなければ ok=false。
func (s *Store) UpdateCategory(id int64, u CategoryUpdate) (bool, error) {
	set := ""
	args := []interface{}{}
	add := func(col string, val interface{}) {
		if set != "" {
			set += ", "
		}
		set += col + " = ?"
		args = append(args, val)
	}

	if u.Name != nil {
		add("name", *u.Name)
	}
	if u.Color != nil {
		add("color", *u.Color)
	}
	if u.SortOrder != nil {
		add("sort_order", *u.SortOrder)
	}

	if set == "" {
		return false, nil
	}
	args = append(args, id)
	res, err := s.db.Exec(`UPDATE categories SET `+set+` WHERE id = ?`, args...)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

// DeleteCategory はカテゴリを削除する。所属していたタスクは category_id を NULL
// （＝通常タスク）に戻す（タスク自体は削除しない）。
func (s *Store) DeleteCategory(id int64) (bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`UPDATE todos SET category_id = NULL WHERE category_id = ?`, id); err != nil {
		return false, err
	}
	res, err := tx.Exec(`DELETE FROM categories WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	if n == 0 {
		return false, nil
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

// ReorderCategories はカテゴリのドラッグ&ドロップ並び替え。渡された順に sort_order を振り直す。
func (s *Store) ReorderCategories(idOrder []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare(`UPDATE categories SET sort_order = ? WHERE id = ?`)
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

// GetCategory は単一カテゴリを返す。存在しない場合は ok=false。
func (s *Store) GetCategory(id int64) (Category, bool, error) {
	row := s.db.QueryRow(`SELECT `+categoryColumns+` FROM categories WHERE id = ?`, id)
	c, err := scanCategory(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Category{}, false, nil
	}
	if err != nil {
		return Category{}, false, err
	}
	return c, true, nil
}
