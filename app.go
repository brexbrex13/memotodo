package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"
	"log"
	"memotodo/internal/board"
	"memotodo/internal/notify"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type App struct {
	store         *board.Store
	desktop       *application.App
	main, notice  *application.WebviewWindow
	stop          chan struct{}
	wg            sync.WaitGroup
	mu            sync.Mutex
	seen          map[int64]bool
	noticeVisible bool
	noticeReady   atomic.Bool
	startOnce     sync.Once
	stopOnce      sync.Once
	quitting      atomic.Bool
}

func (a *App) start() { a.startOnce.Do(func() { a.wg.Add(1); go a.run() }) }
func (a *App) Ready(window string) {
	if window == "notifications" {
		a.noticeReady.Store(true)
	}
	a.start()
	a.refreshNotice()
}
func (a *App) run() {
	defer a.wg.Done()
	a.tick(true)
	if e := a.store.DailyBackup(); e != nil {
		log.Printf("backup: %v", e)
		a.desktop.Event.Emit("board:error", "自動バックアップに失敗しました: "+e.Error())
	}
	backupDay := board.Date(time.Now())
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-a.stop:
			return
		case <-ticker.C:
			a.tick(false)
			if today := board.Date(time.Now()); today != backupDay {
				if e := a.store.DailyBackup(); e != nil {
					a.desktop.Event.Emit("board:error", "自動バックアップに失敗しました: "+e.Error())
				} else {
					backupDay = today
				}
			}
		}
	}
}
func (a *App) tick(startup bool) {
	changed, e := a.store.Tick(time.Now(), startup)
	if e != nil {
		log.Printf("scheduler: %v", e)
		a.desktop.Event.Emit("board:error", "通知処理に失敗しました: "+e.Error())
		return
	}
	if changed {
		a.desktop.Event.Emit("board:changed")
	}
	a.refreshNotice()
}
func (a *App) changed() { a.tick(false); a.desktop.Event.Emit("board:changed") }
func (a *App) refreshNotice() {
	if a.quitting.Load() {
		return
	}
	if !a.noticeReady.Load() {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	v, e := a.store.Snapshot()
	if e != nil {
		return
	}
	pending := 0
	fresh := false
	for _, n := range v.Notifications {
		if !n.Acknowledged {
			pending++
			if !a.seen[n.ID] {
				fresh = true
			}
		}
	}
	paused := false
	if v.Settings.PauseUntil != "" {
		p, e := board.ParseTime(v.Settings.PauseUntil, time.Local)
		paused = e == nil && p.After(time.Now())
	}
	if pending == 0 || paused {
		if a.noticeVisible {
			a.notice.Hide()
			a.noticeVisible = false
		}
		return
	}
	if !a.noticeVisible {
		positionNotice(a.desktop, a.notice, v.Settings.Monitor)
		showNotice(a.notice)
		a.noticeVisible = true
	}
	if fresh {
		for _, n := range v.Notifications {
			if !n.Acknowledged {
				a.seen[n.ID] = true
			}
		}
		if v.Settings.Sound {
			noticeSound()
		}
		if v.Settings.NativeToast {
			body := fmt.Sprintf("未確認の通知が%d件あります", pending)
			if !v.Settings.Private {
				for _, n := range v.Notifications {
					if !n.Acknowledged {
						body = n.Title
						break
					}
				}
			}
			notify.Push("MemoTodo", body)
		}
	}
}
func (a *App) openMain(id int64) {
	a.main.Show()
	a.main.UnMinimise()
	a.main.Focus()
	if id != 0 {
		a.desktop.Event.Emit("board:open", id)
	}
}
func (a *App) GetSnapshot() (board.Snapshot, error) { return a.store.Snapshot() }
func (a *App) SaveTask(v board.Task) (board.Task, error) {
	t, e := a.store.SaveTask(v)
	if e == nil {
		a.changed()
	}
	return t, e
}
func (a *App) SetState(id int64, state string) error {
	e := a.store.SetState(id, state)
	if e == nil {
		a.changed()
	}
	return e
}
func (a *App) Reorder(ids []int64) error {
	e := a.store.Reorder(ids)
	if e == nil {
		a.changed()
	}
	return e
}
func (a *App) SaveCategory(c board.Category) (board.Category, error) {
	v, e := a.store.SaveCategory(c)
	if e == nil {
		a.changed()
	}
	return v, e
}
func (a *App) DeleteCategory(id int64) error {
	e := a.store.DeleteCategory(id)
	if e == nil {
		a.changed()
	}
	return e
}
func (a *App) SaveSeries(v board.Series) (board.Series, error) {
	s, e := a.store.SaveSeries(v)
	if e == nil {
		a.changed()
	}
	return s, e
}
func (a *App) StopSeries(id int64) error {
	e := a.store.StopSeries(id)
	if e == nil {
		a.changed()
	}
	return e
}
func (a *App) SaveSettings(v board.Settings) error {
	e := a.store.SaveSettings(v)
	if e == nil {
		a.changed()
	}
	return e
}
func (a *App) Acknowledge(id int64) error {
	e := a.store.Acknowledge(id)
	if e == nil {
		a.changed()
	}
	return e
}
func (a *App) Snooze(id int64, minutes int) error {
	if minutes < 1 || minutes > 10080 {
		return errors.New("再通知は1分〜7日後で指定してください")
	}
	e := a.store.Snooze(id, board.ISO(time.Now().Add(time.Duration(minutes)*time.Minute)))
	if e == nil {
		a.changed()
	}
	return e
}
func (a *App) TestNotification() error {
	e := a.store.TestNotification()
	if e == nil {
		a.changed()
	}
	return e
}
func (a *App) OpenTask(id int64) { a.openMain(id) }
func (a *App) FinishClose(mode string) {
	if mode == "quit" {
		a.quitting.Store(true)
		a.stopOnce.Do(func() { close(a.stop) })
		a.wg.Wait()
		a.desktop.Quit()
	} else {
		a.main.Hide()
	}
}
func (a *App) SaveImage(dataURL string) (string, error) {
	_, encoded, ok := strings.Cut(dataURL, ",")
	if !ok || len(encoded) > 28*1024*1024 {
		return "", errors.New("画像は20MB以内にしてください")
	}
	b, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil {
		return "", e
	}
	if len(b) > 20<<20 {
		return "", errors.New("画像は20MB以内にしてください")
	}
	mime := http.DetectContentType(b)
	ext := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}[mime]
	if ext == "" {
		return "", errors.New("PNG・JPEG・GIF・WebP画像を指定してください")
	}
	name := uuid.NewString() + ext
	if e = os.WriteFile(filepath.Join(a.store.Dir, "images", name), b, 0644); e != nil {
		return "", e
	}
	return "/images/" + name, nil
}
func (a *App) OpenURL(target string) error {
	u, e := url.Parse(target)
	if e != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return errors.New("HTTP/HTTPSリンクを指定してください")
	}
	return a.desktop.Browser.OpenURL(target)
}
func (a *App) OpenDataFolder() error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer.exe", a.store.Dir)
	case "darwin":
		cmd = exec.Command("open", a.store.Dir)
	default:
		cmd = exec.Command("xdg-open", a.store.Dir)
	}
	return cmd.Start()
}
func (a *App) Backup() (string, error) { return a.store.Backup() }

func (a *App) RestoreBackup(encoded string) error {
	if len(encoded) > 70<<20 {
		return errors.New("バックアップは50MB以内にしてください")
	}
	data, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil {
		return e
	}
	if _, e = a.store.Backup(); e != nil {
		return fmt.Errorf("復元前の退避に失敗しました: %w", e)
	}
	if e = a.store.Restore(data); e != nil {
		return e
	}
	a.mu.Lock()
	a.seen = map[int64]bool{}
	a.mu.Unlock()
	a.changed()
	return nil
}
