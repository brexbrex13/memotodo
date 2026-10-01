package main

import "github.com/wailsapp/wails/v3/pkg/application"

func noticeScreen(app *application.App, monitor string) *application.Screen {
	s := app.Screen.GetPrimary()
	if monitor == "active" {
		s = activeScreen(app)
	} else if monitor != "primary" {
		if chosen := app.Screen.GetByID(monitor); chosen != nil {
			s = chosen
		}
	}
	return s
}
func positionNotice(app *application.App, w *application.WebviewWindow, monitor string) {
	s := noticeScreen(app, monitor)
	if s == nil {
		return
	}
	r := s.WorkArea
	width, height := 360, 170
	if r.Width-24 < width {
		width = r.Width - 24
	}
	if r.Height-24 < height {
		height = r.Height - 24
	}
	w.SetSize(width, height)
	w.SetPosition(r.X+r.Width-width-12, r.Y+r.Height-height-12)
}
