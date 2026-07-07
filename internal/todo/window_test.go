package todo

import "testing"

func TestWindowStateRoundTrip(t *testing.T) {
	dir := t.TempDir()

	if _, ok := LoadWindowState(dir); ok {
		t.Fatal("保存前は ok=false になるべき")
	}

	want := WindowState{Width: 1400, Height: 900, X: 120, Y: 80, Maximized: true}
	if err := SaveWindowState(dir, want); err != nil {
		t.Fatal(err)
	}

	got, ok := LoadWindowState(dir)
	if !ok {
		t.Fatal("保存後は ok=true になるべき")
	}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
}

func TestWindowStateRejectsInvalidSize(t *testing.T) {
	dir := t.TempDir()
	if err := SaveWindowState(dir, WindowState{Width: 0, Height: 0}); err != nil {
		t.Fatal(err)
	}
	if _, ok := LoadWindowState(dir); ok {
		t.Error("幅・高さが0の保存済み状態は ok=false になるべき（デフォルトサイズへフォールバック）")
	}
}
