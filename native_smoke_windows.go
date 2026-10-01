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
			if style&0x8 == 0 || style&0x80 == 0 || style&0x40000 != 0 {
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
			finish(fmt.Errorf("expected two grouped persistent notifications, got %d", pending))
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
		finish(nil)
	}()
}
