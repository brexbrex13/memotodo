//go:build !windows || server

package main

type shortcutManager struct{}

func newShortcutManager(func()) *shortcutManager { return &shortcutManager{} }
func (*shortcutManager) Change(string) error     { return nil }
func (*shortcutManager) Close()                  {}
func (*App) rememberQuickFocus()                 {}
func (a *App) hideQuickNative()                  { a.mini.Hide() }

func (*App) placeQuickAtCursor(bool) {}
func (*App) quickLostFocus()         {}
