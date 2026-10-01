package board

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Restore accepts only our explicit export format. It preserves all existing
// images, uses new filenames for conflicting attachments, and commits all rows
// together. A failed restore may leave orphan images, never a half restored DB.
func (s *Store) Restore(data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(data) > 50<<20 {
		return errors.New("バックアップは50MB以内にしてください")
	}
	z, e := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if e != nil {
		return e
	}
	var dump struct {
		Format  string                       `json:"format"`
		Version int                          `json:"version"`
		Tables  map[string][]json.RawMessage `json:"tables"`
	}
	files := map[string][]byte{}
	var total uint64
	for _, f := range z.File {
		total += f.UncompressedSize64
		if total > 200<<20 {
			return errors.New("展開後の容量が200MBを超えています")
		}
		if f.Name != "board.json" && (!strings.HasPrefix(f.Name, "images/") || filepath.Base(f.Name) != strings.TrimPrefix(f.Name, "images/") || strings.ContainsAny(f.Name, "\\:")) {
			return errors.New("バックアップ内のパスが不正です")
		}
		if _, exists := files[f.Name]; exists {
			return errors.New("バックアップ内に重複ファイルがあります")
		}
		r, e := f.Open()
		if e != nil {
			return e
		}
		b, e := io.ReadAll(io.LimitReader(r, 200<<20+1))
		r.Close()
		if e != nil {
			return e
		}
		files[f.Name] = b
	}
	if e = json.Unmarshal(files["board.json"], &dump); e != nil {
		return e
	}
	if dump.Format != "memotodo-board-v3" || dump.Version != 1 {
		return errors.New("MemoTodo v3のバックアップを選んでください")
	}
	for _, table := range []string{"tasks", "categories", "series", "notifications", "metadata"} {
		if _, ok := dump.Tables[table]; !ok {
			return errors.New("バックアップ内のテーブルが不足しています")
		}
	}
	remap := map[string]string{}
	for path, b := range files {
		if path == "board.json" {
			continue
		}
		name := strings.TrimPrefix(path, "images/")
		if old, e := os.ReadFile(filepath.Join(s.Dir, path)); e == nil && !bytes.Equal(old, b) {
			name = uuid.NewString() + filepath.Ext(name)
			remap[strings.TrimPrefix(path, "images/")] = name
		}
		if e = os.WriteFile(filepath.Join(s.Dir, "images", name), b, 0644); e != nil {
			return e
		}
	}
	rewrite := func(memo string) string {
		for old, name := range remap {
			memo = strings.ReplaceAll(memo, "/images/"+old, "/images/"+name)
		}
		return memo
	}
	tx, e := s.db.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	for _, table := range []string{"tasks", "categories", "series", "notifications", "metadata"} {
		if _, e = tx.Exec("DELETE FROM " + table); e != nil {
			return e
		}
	}
	for _, b := range dump.Tables["metadata"] {
		var v struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}
		if e = json.Unmarshal(b, &v); e != nil {
			return e
		}
		switch v.Key {
		case "settings":
			var settings Settings
			if e = json.Unmarshal([]byte(v.Value), &settings); e != nil {
				return e
			}
		case "summary_cursor":
			if !strings.HasPrefix(v.Value, "summary:") {
				return errors.New("定時通知の記録が不正です")
			}
			if _, e = time.Parse("2006-01-02:15:04", strings.TrimPrefix(v.Value, "summary:")); e != nil {
				return errors.New("定時通知の記録が不正です")
			}
		default:
			return fmt.Errorf("未知の設定: %s", v.Key)
		}
		if _, e = tx.Exec("INSERT INTO metadata(key,value) VALUES(?,?)", v.Key, v.Value); e != nil {
			return e
		}
	}
	restoredSettings, e := s.settings(tx)
	if e != nil {
		return e
	}
	for _, b := range dump.Tables["categories"] {
		var c Category
		if e = json.Unmarshal(b, &c); e != nil {
			return e
		}
		if c.ID < 1 || c.Name == "" || !validColor(c.Color) {
			return errors.New("カテゴリが不正です")
		}
		encoded, _ := json.Marshal(c)
		if _, e = tx.Exec("INSERT INTO categories(id,data) VALUES(?,?)", c.ID, string(encoded)); e != nil {
			return e
		}
	}
	for _, b := range dump.Tables["series"] {
		var v Series
		if e = json.Unmarshal(b, &v); e != nil {
			return e
		}
		if v.ID < 1 {
			return errors.New("定期設定IDが不正です")
		}
		if v.ShowDays == -1 {
			v.ShowDays = restoredSettings.SeriesShowDays
			v.Version++
		}
		if e = validateSeries(v); e != nil {
			return e
		}
		if _, e = ParseTime(v.NextDue, s.now().Location()); e != nil {
			return e
		}
		v.Memo = rewrite(v.Memo)
		encoded, _ := json.Marshal(v)
		if _, e = tx.Exec("INSERT INTO series(id,data) VALUES(?,?)", v.ID, string(encoded)); e != nil {
			return e
		}
	}
	for _, b := range dump.Tables["tasks"] {
		var v Task
		if e = json.Unmarshal(b, &v); e != nil {
			return e
		}
		if v.ID < 1 {
			return errors.New("付箋IDが不正です")
		}
		if e = validateTask(v); e != nil {
			return e
		}
		v.Memo = rewrite(v.Memo)
		encoded, _ := json.Marshal(v)
		if _, e = tx.Exec("INSERT INTO tasks(id,series_id,occurrence,data) VALUES(?,?,?,?)", v.ID, v.SeriesID, v.Occurrence, string(encoded)); e != nil {
			return e
		}
	}
	for _, b := range dump.Tables["notifications"] {
		var n Notification
		if e = json.Unmarshal(b, &n); e != nil {
			return e
		}
		if n.ID < 1 || n.Key == "" {
			return errors.New("通知が不正です")
		}
		if _, e = tx.Exec("INSERT INTO notifications(id,event_key,data) VALUES(?,?,?)", n.ID, n.Key, string(b)); e != nil {
			return e
		}
	}
	if e = s.freezeInheritedLead(tx); e != nil {
		return e
	}
	return tx.Commit()
}
