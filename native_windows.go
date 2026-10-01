//go:build windows && !server

package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/sys/windows"
	"unsafe"
)

var user32 = windows.NewLazySystemDLL("user32.dll")
var showWindow = user32.NewProc("ShowWindow")
var setWindowPos = user32.NewProc("SetWindowPos")
var getForegroundWindow = user32.NewProc("GetForegroundWindow")
var getWindowRect = user32.NewProc("GetWindowRect")
var messageBeep = user32.NewProc("MessageBeep")

// ExStyle replaces Wails' computed styles. Preserve TOPMOST, TOOLWINDOW and
// CONTROLPARENT, add NOACTIVATE to prevent WebView focus activation too.
func noticeStyle() int { return 0x08000000 | 0x00000008 | 0x00000080 | 0x00010000 }

// A thread-local CBT hook vetoes activation of these notification windows. Wails Show is
// still used so WebView2 visibility and Wails window state remain consistent.
// The hook also covers late WebView2 focus requests after navigation completes.
var noticeHook uintptr
var noticeHWND uintptr
var noticeHandles = map[uintptr]bool{}
var setHook = user32.NewProc("SetWindowsHookExW")
var nextHook = user32.NewProc("CallNextHookEx")
var getThread = user32.NewProc("GetWindowThreadProcessId")
var getAncestor = user32.NewProc("GetAncestor")
var activationGuard = windows.NewCallback(func(code int, wparam, lparam uintptr) uintptr {
	if code == 5 {
		root, _, _ := getAncestor.Call(wparam, 2)
		if noticeHandles[wparam] || noticeHandles[root] {
			return 1
		}
	}
	result, _, _ := nextHook.Call(noticeHook, uintptr(code), wparam, lparam)
	return result
})

// Windows may invoke thread hooks while ExitProcess tears down remaining HWNDs.
// Go callbacks are no longer valid then; remove the hook before Wails shuts down.
func releaseNoticeNative() {
	application.InvokeSync(func() {
		if noticeHook != 0 {
			user32.NewProc("UnhookWindowsHookEx").Call(noticeHook)
			noticeHook = 0
		}
	})
}

func showNotice(w *application.WebviewWindow) {
	application.InvokeSync(func() {
		noticeHWND = uintptr(w.NativeWindow())
		noticeHandles[noticeHWND] = true
		if noticeHook == 0 {
			thread, _, _ := getThread.Call(noticeHWND, 0)
			noticeHook, _, _ = setHook.Call(5, activationGuard, 0, thread)
		}
	})
	w.Show()
	application.InvokeSync(func() {
		showWindow.Call(noticeHWND, 4)
		setWindowPos.Call(noticeHWND, ^uintptr(0), 0, 0, 0, 0, 0x0001|0x0002|0x0010|0x0040)
	})
}
func noticeSound() { messageBeep.Call(0x40) }
func activeScreen(app *application.App) *application.Screen {
	h, _, _ := getForegroundWindow.Call()
	var r struct{ Left, Top, Right, Bottom int32 }
	getWindowRect.Call(h, uintptr(unsafe.Pointer(&r)))
	x, y := int((r.Left+r.Right)/2), int((r.Top+r.Bottom)/2)
	for _, s := range app.Screen.GetAll() {
		b := s.PhysicalBounds
		if x >= b.X && x < b.X+b.Width && y >= b.Y && y < b.Y+b.Height {
			return s
		}
	}
	return app.Screen.GetPrimary()
}

func openFile(path string) error {
	verb, _ := windows.UTF16PtrFromString("open")
	file, e := windows.UTF16PtrFromString(path)
	if e != nil {
		return e
	}
	return windows.ShellExecute(0, verb, file, nil, nil, 1)
}
func forgetNotice(w *application.WebviewWindow) {
	application.InvokeSync(func() { delete(noticeHandles, uintptr(w.NativeWindow())) })
}
