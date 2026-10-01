//go:build !windows || server

package main

import "github.com/wailsapp/wails/v3/pkg/application"

func noticeStyle() int                                    { return 0 }
func showNotice(w *application.WebviewWindow)             { w.Show() }
func noticeSound()                                        {}
func releaseNoticeNative()                                {}
func activeScreen(a *application.App) *application.Screen { return a.Screen.GetPrimary() }
