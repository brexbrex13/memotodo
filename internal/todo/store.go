// Package todo は TODO MOD（メモ管理・定期タスク管理）のデータ操作とスケジューリングを提供する。
// 旧 Python 実装（apps/todo/manager.py）の挙動を Go に移植したもの。
package todo

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Store は TODO MOD のDB・設定・画像ディレクトリへのアクセスをまとめる。
type Store struct {
	db           *sql.DB
	dataDir      string
	imagesDir    string
	settingsPath string
}

// NewStore はデータディレクトリを準備し、DBスキーマを初期化した Store を返す。
// dataDir 配下に todo.db / todo_settings.json / todo_images/ を配置する。
func NewStore(dataDir string) (*Store, error) {
	imagesDir := filepath.Join(dataDir, "todo_images")
	if err := os.MkdirAll(imagesDir, 0o755); err != nil {
		return nil, fmt.Errorf("データディレクトリの作成に失敗しました: %w", err)
	}

	dbPath := filepath.Join(dataDir, "todo.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("DBオープンに失敗しました: %w", err)
	}
	// SQLiteは同時書き込みに弱いため、単一コネクションで直列化する
	db.SetMaxOpenConns(1)

	s := &Store{
		db:           db,
		dataDir:      dataDir,
		imagesDir:    imagesDir,
		settingsPath: filepath.Join(dataDir, "todo_settings.json"),
	}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) ImagesDir() string {
	return s.imagesDir
}

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS todos (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			title            TEXT    NOT NULL,
			memo             TEXT    NOT NULL DEFAULT '',
			status           TEXT    NOT NULL DEFAULT 'pending',
			deadline         TEXT,
			reminder_enabled INTEGER NOT NULL DEFAULT 0,
			reminder_at      TEXT,
			reminded         INTEGER NOT NULL DEFAULT 0,
			created_at       TEXT    NOT NULL,
			done_at          TEXT,
			is_important     INTEGER NOT NULL DEFAULT 0,
			sort_order       INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS recurring_tasks (
			id                  INTEGER PRIMARY KEY AUTOINCREMENT,
			title               TEXT    NOT NULL,
			memo                TEXT    NOT NULL DEFAULT '',
			period_type         TEXT    NOT NULL,
			period_value        TEXT    NOT NULL,
			current_deadline    TEXT,
			status              TEXT    NOT NULL DEFAULT 'pending',
			done_at             TEXT,
			is_active           INTEGER NOT NULL DEFAULT 1,
			created_at          TEXT    NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS categories (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			name       TEXT    NOT NULL,
			color      TEXT    NOT NULL DEFAULT '',
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at TEXT    NOT NULL
		)`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return fmt.Errorf("スキーマ初期化に失敗しました: %w", err)
		}
	}
	if err := s.addColumnIfMissing("todos", "category_id", "INTEGER"); err != nil {
		return err
	}
	return nil
}

// addColumnIfMissing はテーブルに指定カラムが無ければ ALTER TABLE で追加する。
// ALTER TABLE ADD COLUMN は再実行するとエラーになるため、事前に存在確認する。
func (s *Store) addColumnIfMissing(table, column, columnDef string) error {
	rows, err := s.db.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, table))
	if err != nil {
		return fmt.Errorf("スキーマ確認に失敗しました: %w", err)
	}
	defer rows.Close()

	var exists bool
	for rows.Next() {
		var cid int
		var name, ctype string
		var notNull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dflt, &pk); err != nil {
			return fmt.Errorf("スキーマ確認に失敗しました: %w", err)
		}
		if name == column {
			exists = true
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("スキーマ確認に失敗しました: %w", err)
	}
	if exists {
		return nil
	}
	if _, err := s.db.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN %s %s`, table, column, columnDef)); err != nil {
		return fmt.Errorf("スキーマ更新に失敗しました: %w", err)
	}
	return nil
}
