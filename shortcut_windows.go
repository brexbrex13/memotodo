//go:build windows && !server

package main

import (
	"fmt"
	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/sys/windows"
	"memotodo/internal/board"
	"runtime"
	"sync"
	"time"
	"unsafe"
)

type shortcutCommand struct {
	key   string
	stop  bool
	reply chan error
}
type shortcutManager struct {
	mu       sync.Mutex
	thread   uint32
	commands chan shortcutCommand
	done     chan struct{}
	closed   bool
}
type shortcutMessage struct {
	Window         uintptr
	Message        uint32
	WParam, LParam uintptr
	Time           uint32
	X, Y           int32
	Private        uint32
}

func newShortcutManager(callback func()) *shortcutManager {
	m := &shortcutManager{commands: make(chan shortcutCommand, 1), done: make(chan struct{})}
	ready := make(chan struct{})
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		defer close(m.done)
		var msg shortcutMessage
		// Ensure the thread's message queue exists before exposing its ID.
		user32.NewProc("PeekMessageW").Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0, 0)
		m.thread = windows.GetCurrentThreadId()
		close(ready)
		key := ""
		id := uintptr(1)
		registered := false
		defer func() {
			if registered {
				user32.NewProc("UnregisterHotKey").Call(0, id)
			}
		}()
		for {
			r, _, _ := user32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
			if r == 0 || r == ^uintptr(0) {
				return
			}
			if msg.Message == 0x0312 && registered && msg.WParam == id {
				go callback()
			}
			if msg.Message != 0x8001 {
				continue
			}
			command := <-m.commands
			if command.stop {
				command.reply <- nil
				return
			}
			if command.key == key {
				command.reply <- nil
				continue
			}
			mods, vk, e := board.ParseShortcut(command.key)
			if e == nil && command.key != "" {
				nextID := uintptr(3) - id
				ok, _, _ := user32.NewProc("RegisterHotKey").Call(0, nextID, uintptr(mods)|0x4000, uintptr(vk))
				if ok == 0 {
					e = fmt.Errorf("%s は他のアプリまたはWindowsで使用されています。別のキーを選んでください", command.key)
				} else {
					if registered {
						user32.NewProc("UnregisterHotKey").Call(0, id)
					}
					id = nextID
					registered = true
					key = command.key
				}
			} else if e == nil {
				if registered {
					user32.NewProc("UnregisterHotKey").Call(0, id)
				}
				registered = false
				key = ""
			}
			command.reply <- e
		}
	}()
	<-ready
	return m
}
func (m *shortcutManager) Change(key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return fmt.Errorf("アプリを終了中です")
	}
	return m.send(shortcutCommand{key: key, reply: make(chan error, 1)})
}
func (m *shortcutManager) send(command shortcutCommand) error {
	select {
	case <-m.done:
		return fmt.Errorf("ショートカット処理が停止しています")
	default:
	}
	m.commands <- command
	ok, _, err := user32.NewProc("PostThreadMessageW").Call(uintptr(m.thread), 0x8001, 0, 0)
	if ok == 0 {
		<-m.commands
		return err
	}
	select {
	case e := <-command.reply:
		return e
	case <-m.done:
		return fmt.Errorf("ショートカット処理が停止しました")
	}
}
func (m *shortcutManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return
	}
	m.closed = true
	m.send(shortcutCommand{stop: true, reply: make(chan error, 1)})
	<-m.done
}
func (a *App) rememberQuickFocus() {
	foreground, _, _ := getForegroundWindow.Call()
	if foreground != uintptr(a.mini.NativeWindow()) {
		a.quickPrevious.Store(foreground)
	}
}
func (a *App) hideQuickNative() {
	application.InvokeSync(func() {
		previous := a.quickPrevious.Swap(0)
		foreground, _, _ := getForegroundWindow.Call()
		wasQuick := foreground == uintptr(a.mini.NativeWindow())
		// Hiding an active window can select another window automatically. Return
		// focus afterwards, on the UI thread; never override a user's app switch.
		a.mini.Hide()
		if !wasQuick || previous == 0 {
			return
		}
		valid, _, _ := user32.NewProc("IsWindow").Call(previous)
		if valid == 0 {
			return
		}
		user32.NewProc("SetForegroundWindow").Call(previous)
	})
}

// Coordinates come from Win32 in physical pixels, as do the native bounds.
func (a *App) placeQuickAtCursor(capture bool) {
	application.InvokeSync(func() {
		if capture {
			var point struct{ X, Y int32 }
			ok, _, _ := user32.NewProc("GetCursorPos").Call(uintptr(unsafe.Pointer(&point)))
			if ok == 0 {
				return
			}
			a.quickX, a.quickY = point.X, point.Y
		}
		packed := uintptr(uint64(uint32(a.quickX)) | uint64(uint32(a.quickY))<<32)
		monitor, _, _ := user32.NewProc("MonitorFromPoint").Call(packed, 2)
		var info struct {
			Size          uint32
			Monitor, Work struct{ Left, Top, Right, Bottom int32 }
			Flags         uint32
		}
		info.Size = uint32(unsafe.Sizeof(info))
		ok, _, _ := user32.NewProc("GetMonitorInfoW").Call(monitor, uintptr(unsafe.Pointer(&info)))
		if ok == 0 {
			return
		}
		var rect struct{ Left, Top, Right, Bottom int32 }
		ok, _, _ = user32.NewProc("GetWindowRect").Call(uintptr(a.mini.NativeWindow()), uintptr(unsafe.Pointer(&rect)))
		if ok == 0 {
			return
		}
		x, y := a.quickX+12, a.quickY+12
		width, height := rect.Right-rect.Left, rect.Bottom-rect.Top
		if x+width > info.Work.Right {
			x = info.Work.Right - width
		}
		if y+height > info.Work.Bottom {
			y = info.Work.Bottom - height
		}
		if x < info.Work.Left {
			x = info.Work.Left
		}
		if y < info.Work.Top {
			y = info.Work.Top
		}
		user32.NewProc("SetWindowPos").Call(uintptr(a.mini.NativeWindow()), 0, uintptr(x), uintptr(y), 0, 0, 0x15)
	})
}

// A manually moved mini window keeps its position while its options expand.
func (a *App) rememberQuickPosition() {
	application.InvokeSync(func() {
		var r struct{ Left, Top, Right, Bottom int32 }
		ok, _, _ := getWindowRect.Call(uintptr(a.mini.NativeWindow()), uintptr(unsafe.Pointer(&r)))
		if ok != 0 {
			a.quickX, a.quickY = r.Left-12, r.Top-12
			a.quickCursor.Store(true)
		}
	})
}
func (a *App) quickLostFocus() {
	if a.quitting.Load() {
		return
	}
	generation := a.quickGeneration.Load()
	time.AfterFunc(80*time.Millisecond, func() {
		application.InvokeSync(func() {
			if a.quitting.Load() || generation != a.quickGeneration.Load() {
				return
			}
			foreground, _, _ := getForegroundWindow.Call()
			root, _, _ := user32.NewProc("GetAncestor").Call(foreground, 3)
			if foreground == uintptr(a.mini.NativeWindow()) || root == uintptr(a.mini.NativeWindow()) {
				return
			}
			a.mini.Hide()
		})
	})
}
