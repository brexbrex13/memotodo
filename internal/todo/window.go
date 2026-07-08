package todo

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// WindowState はメインウィンドウのサイズ・位置・最大化状態。次回起動時に復元する。
type WindowState struct {
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	X         int  `json:"x"`
	Y         int  `json:"y"`
	Maximized bool `json:"maximized"`
}

func windowStatePath(dataDir string) string {
	return filepath.Join(dataDir, "window_state.json")
}

// LoadWindowState は保存済みのウィンドウ状態を返す。
// ファイルが無い・壊れている・サイズが不正な場合は ok=false を返す
// （呼び出し側でデフォルトサイズにフォールバックする）。
func LoadWindowState(dataDir string) (WindowState, bool) {
	data, err := os.ReadFile(windowStatePath(dataDir))
	if err != nil {
		return WindowState{}, false
	}
	var s WindowState
	if err := json.Unmarshal(data, &s); err != nil {
		return WindowState{}, false
	}
	if s.Width <= 0 || s.Height <= 0 {
		return WindowState{}, false
	}
	return s, true
}

// SaveWindowState はウィンドウ状態を保存する。
func SaveWindowState(dataDir string, s WindowState) error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(windowStatePath(dataDir), data, 0o644)
}
