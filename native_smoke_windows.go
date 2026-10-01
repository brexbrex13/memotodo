//go:build nativesmoke && windows && !server

package main

import (
	"encoding/json"
	"fmt"
	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/sys/windows"
	"os"
	"os/exec"
	"runtime"
	"runtime/pprof"
	"time"
	"unsafe"
)

const probeTitle = "MemoTodo focus probe"

func runNativeProbe() bool {
	if len(os.Args) < 2 || os.Args[1] != "--focus-probe" {
		return false
	}
	runtime.LockOSThread()
	class, _ := windows.UTF16PtrFromString("STATIC")
	title, _ := windows.UTF16PtrFromString(probeTitle)
	h, _, _ := user32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(title)), 0x10cf0000, 100, 100, 300, 180, 0, 0, 0, 0)
	user32.NewProc("SetForegroundWindow").Call(h)
	type msg struct {
		Window         uintptr
		Message        uint32
		WParam, LParam uintptr
		Time           uint32
		X, Y           int32
		Private        uint32
	}
	var m msg
	for {
		r, _, _ := user32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 || r == ^uintptr(0) {
			break
		}
		user32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&m)))
		user32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&m)))
	}
	return true
}

var smokePoint = make(chan [2]float64, 1)

func (a *App) SmokeTarget(x, y float64) {
	select {
	case smokePoint <- [2]float64{x, y}:
	default:
	}
}
func clickAcknowledge(a *App) error {
	a.notice.ExecJS(`(()=>{const b=document.querySelector('.notice-window header button[aria-label="通知を閉じる"]');if(!b)return;const r=b.getBoundingClientRect();fetch('/wails/runtime?object=0&method=0&args='+encodeURIComponent(JSON.stringify({'call-id':'native-click',methodName:'main.App.SmokeTarget',args:[r.x+r.width/2,r.y+r.height/2]})))})()`)
	var p [2]float64
	select {
	case p = <-smokePoint:
	case <-time.After(5 * time.Second):
		return fmt.Errorf("notification renderer did not expose acknowledgement button")
	}
	h := uintptr(a.notice.NativeWindow())
	dpi, _, _ := user32.NewProc("GetDpiForWindow").Call(h)
	point := struct{ X, Y int32 }{int32(p[0] * float64(dpi) / 96), int32(p[1] * float64(dpi) / 96)}
	user32.NewProc("ClientToScreen").Call(h, uintptr(unsafe.Pointer(&point)))
	user32.NewProc("SetCursorPos").Call(uintptr(point.X), uintptr(point.Y))
	user32.NewProc("mouse_event").Call(2, 0, 0, 0, 0)
	user32.NewProc("mouse_event").Call(4, 0, 0, 0, 0)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		v, e := a.store.Snapshot()
		if e != nil {
			return e
		}
		pending := false
		for _, n := range v.Notifications {
			pending = pending || !n.Acknowledged
		}
		if !pending {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("notification acknowledgement did not respond to physical mouse click")
}
func startNativeVerification(a *App) {
	go func() {
		result := map[string]any{"passed": false}
		finish := func(e error) {
			if e != nil {
				result["error"] = e.Error()
			} else {
				result["passed"] = true
			}
			b, _ := json.MarshalIndent(result, "", "  ")
			os.WriteFile("native-smoke.json", b, 0644)
			go func() {
				time.Sleep(10 * time.Second)
				f, _ := os.Create("native-shutdown.txt")
				if f != nil {
					pprof.Lookup("goroutine").WriteTo(f, 2)
					f.Close()
				}
				os.Exit(2)
			}()
			a.FinishClose("quit")
		}
		time.Sleep(2 * time.Second)
		deadline := time.Now().Add(20 * time.Second)
		for !a.noticeReady.Load() && time.Now().Before(deadline) {
			time.Sleep(100 * time.Millisecond)
		}
		if !a.noticeReady.Load() {
			finish(fmt.Errorf("notification renderer did not initialise"))
			return
		}
		a.main.Hide()
		exe, _ := os.Executable()
		probe := exec.Command(exe, "--focus-probe")
		if e := probe.Start(); e != nil {
			finish(e)
			return
		}
		defer probe.Process.Kill()
		title, _ := windows.UTF16PtrFromString(probeTitle)
		var foreground uintptr
		deadline = time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			foreground, _, _ = user32.NewProc("FindWindowW").Call(0, uintptr(unsafe.Pointer(title)))
			active, _, _ := getForegroundWindow.Call()
			if foreground != 0 && active == foreground {
				break
			}
			time.Sleep(100 * time.Millisecond)
		}
		active, _, _ := getForegroundWindow.Call()
		if foreground == 0 || active != foreground {
			finish(fmt.Errorf("could not establish external foreground window"))
			return
		}
		settings, _ := a.store.Snapshot()
		settings.Settings.Sound = false
		settings.Settings.NotifyTimes = []string{}
		a.store.SaveSettings(settings.Settings)
		check := func(label string) error {
			if e := a.TestNotification(); e != nil {
				return e
			}
			time.Sleep(time.Second)
			h := uintptr(a.notice.NativeWindow())
			visible, _, _ := user32.NewProc("IsWindowVisible").Call(h)
			style, _, _ := user32.NewProc("GetWindowLongPtrW").Call(h, ^uintptr(19))
			active, _, _ := getForegroundWindow.Call()
			if visible == 0 {
				return fmt.Errorf("%s: notification not visible", label)
			}
			if style&0x8 == 0 || style&0x80 != 0 || style&0x40000 == 0 {
				return fmt.Errorf("%s: incorrect topmost/taskbar style: %x", label, style)
			}
			if active != foreground {
				return fmt.Errorf("%s: keyboard focus stolen (before=%x after=%x)", label, foreground, active)
			}
			result[label] = true
			return nil
		}
		if e := check("hidden-main"); e != nil {
			finish(e)
			return
		}
		if e := a.TestNotification(); e != nil {
			finish(e)
			return
		}
		v, _ := a.store.Snapshot()
		pending := 0
		for _, n := range v.Notifications {
			if !n.Acknowledged {
				pending++
			}
		}
		if pending != 2 {
			finish(fmt.Errorf("expected two persistent notifications, got %d", pending))
			return
		}
		time.Sleep(2 * time.Second)
		a.mu.Lock()
		secondary := len(a.noticeWindows)
		var extra *application.WebviewWindow
		for _, w := range a.noticeWindows {
			extra = w
		}
		a.mu.Unlock()
		if secondary != 1 || extra == nil {
			finish(fmt.Errorf("second notification has no independent window"))
			return
		}
		var secondVisible uintptr
		deadline = time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) {
			secondVisible, _, _ = user32.NewProc("IsWindowVisible").Call(uintptr(extra.NativeWindow()))
			active, _, _ = getForegroundWindow.Call()
			if active != foreground {
				finish(fmt.Errorf("second notification stole focus (before=%x after=%x visible=%d)", foreground, active, secondVisible))
				return
			}
			if secondVisible != 0 {
				break
			}
			time.Sleep(100 * time.Millisecond)
		}
		if secondVisible == 0 {
			a.mu.Lock()
			loaded := a.noticeLoaded
			shown := a.noticeShown
			message := fmt.Errorf("second notification remained hidden (loaded=%v shown=%v hwnd=%x)", loaded, shown, uintptr(extra.NativeWindow()))
			a.mu.Unlock()
			finish(message)
			return
		}
		var firstRect, secondRect struct{ Left, Top, Right, Bottom int32 }
		getWindowRect.Call(uintptr(a.notice.NativeWindow()), uintptr(unsafe.Pointer(&firstRect)))
		getWindowRect.Call(uintptr(extra.NativeWindow()), uintptr(unsafe.Pointer(&secondRect)))
		if firstRect.Top < secondRect.Bottom && secondRect.Top < firstRect.Bottom && firstRect.Left < secondRect.Right && secondRect.Left < firstRect.Right {
			finish(fmt.Errorf("notification windows overlap"))
			return
		}
		result["multiple-notifications"] = true
		time.Sleep(2 * time.Second)
		visible, _, _ := user32.NewProc("IsWindowVisible").Call(uintptr(a.notice.NativeWindow()))
		if visible == 0 {
			finish(fmt.Errorf("notification disappeared without acknowledgement"))
			return
		}
		result["persistent-until-ack"] = true
		a.Acknowledge(0)
		visible, _, _ = user32.NewProc("IsWindowVisible").Call(uintptr(a.notice.NativeWindow()))
		if visible != 0 {
			finish(fmt.Errorf("acknowledged window stayed visible"))
			return
		}
		result["ack-hides-window"] = true
		a.main.Show()
		a.main.Minimise()
		user32.NewProc("SetForegroundWindow").Call(foreground)
		time.Sleep(500 * time.Millisecond)
		if e := check("minimised-main"); e != nil {
			finish(e)
			return
		}
		application.InvokeSync(func() { setWindowPos.Call(uintptr(a.notice.NativeWindow()), ^uintptr(0), 0, 0, 0, 0, 0x1|0x2|0x10) })
		if e := clickAcknowledge(a); e != nil {
			finish(e)
			return
		}
		result["mouse-acknowledgement"] = true
		a.main.Hide()
		application.InvokeSync(a.traySingleClick)
		time.Sleep(doubleClickDelay() + 500*time.Millisecond)
		miniVisible, _, _ := user32.NewProc("IsWindowVisible").Call(uintptr(a.mini.NativeWindow()))
		mainVisible, _, _ := user32.NewProc("IsWindowVisible").Call(uintptr(a.main.NativeWindow()))
		if miniVisible == 0 || mainVisible != 0 {
			finish(fmt.Errorf("tray single click did not open only the quick input"))
			return
		}
		a.mini.Hide()
		a.trayDouble.Store(0)
		application.InvokeSync(func() { a.traySingleClick(); a.trayDoubleClick(); a.traySingleClick() })
		time.Sleep(doubleClickDelay() + 500*time.Millisecond)
		miniVisible, _, _ = user32.NewProc("IsWindowVisible").Call(uintptr(a.mini.NativeWindow()))
		mainVisible, _, _ = user32.NewProc("IsWindowVisible").Call(uintptr(a.main.NativeWindow()))
		if miniVisible != 0 || mainVisible == 0 {
			finish(fmt.Errorf("tray double click left a delayed quick input"))
			return
		}
		// Exercise real RegisterHotKey delivery and atomic conflict handling.
		settings, err := a.store.Snapshot()
		if err != nil {
			finish(err)
			return
		}
		savedShortcut := settings.Settings.QuickShortcut
		settings.Settings.QuickShortcut = "Ctrl+Alt+Shift+F11"
		if err = a.SaveSettings(settings.Settings); err != nil {
			finish(err)
			return
		}
		competitor := newShortcutManager(func() {})
		if err = competitor.Change(settings.Settings.QuickShortcut); err == nil {
			competitor.Close()
			finish(fmt.Errorf("duplicate global shortcut accepted"))
			return
		}
		settings.Settings.QuickShortcut = ""
		if err = a.SaveSettings(settings.Settings); err != nil {
			competitor.Close()
			finish(err)
			return
		}
		if err = competitor.Change("Ctrl+Alt+Shift+F11"); err != nil {
			competitor.Close()
			finish(err)
			return
		}
		settings.Settings.QuickShortcut = "Ctrl+Alt+Shift+F11"
		if err = a.SaveSettings(settings.Settings); err == nil {
			competitor.Close()
			finish(fmt.Errorf("conflicting shortcut was saved"))
			return
		}
		latest, _ := a.store.Snapshot()
		if latest.Settings.QuickShortcut != "" {
			competitor.Close()
			finish(fmt.Errorf("failed shortcut change modified persisted settings"))
			return
		}
		competitor.Close()
		if err = a.SaveSettings(settings.Settings); err != nil {
			finish(err)
			return
		}
		a.main.Hide()
		a.mini.Hide()
		user32.NewProc("SetForegroundWindow").Call(foreground)
		keyboard := user32.NewProc("keybd_event")
		for _, key := range []uintptr{0x11, 0x12, 0x10, 0x7A} {
			keyboard.Call(key, 0, 0, 0)
		}
		for _, key := range []uintptr{0x7A, 0x10, 0x12, 0x11} {
			keyboard.Call(key, 0, 2, 0)
		}
		deadline = time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			miniVisible, _, _ = user32.NewProc("IsWindowVisible").Call(uintptr(a.mini.NativeWindow()))
			active, _, _ = getForegroundWindow.Call()
			if miniVisible != 0 && active == uintptr(a.mini.NativeWindow()) {
				break
			}
			time.Sleep(100 * time.Millisecond)
		}
		if miniVisible == 0 || active != uintptr(a.mini.NativeWindow()) {
			finish(fmt.Errorf("global shortcut did not focus quick input"))
			return
		}
		a.HideQuickAdd()
		time.Sleep(200 * time.Millisecond)
		active, _, _ = getForegroundWindow.Call()
		if active != foreground {
			finish(fmt.Errorf("closing quick input did not return to original app"))
			return
		}
		settings.Settings.QuickShortcut = savedShortcut
		if err = a.SaveSettings(settings.Settings); err != nil {
			finish(err)
			return
		}
		result["global-shortcut-change-disable-conflict-focus"] = true
		result["tray-single-double-click"] = true
		finish(nil)
	}()
}
