package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"memotodo/internal/jev"
	"memotodo/internal/smartadd"
	"strings"
	"time"
)

type jevAPI interface {
	Ask(ctx context.Context, state any, questions map[string]jev.Question) (map[string]jev.Answer, error)
	Models(ctx context.Context) error
}

type JevStatus struct {
	Supported  bool   `json:"supported"`
	Configured bool   `json:"configured"`
	Hint       string `json:"hint"`
	Invalid    bool   `json:"invalid"`
}

var jevProviders = map[string]bool{"typesafe": true, "vercel": true, "cloudflare": true, "custom": true}

func providerName(p string) string {
	if p == "" {
		return "typesafe"
	}
	return p
}

func (a *App) jevFor(ep jev.Endpoint, key string) (jevAPI, error) {
	if a.newJev != nil {
		return a.newJev(ep, key)
	}
	return jev.NewFor(ep, key)
}

// The key file holds one JSON object of provider → key. A file written before providers
// existed holds the bare TypeSafe key and is read as such.
func (a *App) loadJevKeys() map[string]string {
	keys := map[string]string{}
	if a.jevKeys == nil || !a.jevKeys.Supported() {
		return keys
	}
	raw, e := a.jevKeys.Load()
	if e != nil {
		log.Printf("jev key: %v", e)
		return keys
	}
	if strings.HasPrefix(raw, "{") && json.Unmarshal([]byte(raw), &keys) == nil {
		return keys
	}
	if raw != "" {
		keys["typesafe"] = raw
	}
	return keys
}

func (a *App) jevKeyFor(provider string) string { return a.loadJevKeys()[providerName(provider)] }

func (a *App) setJevBad(provider string, bad bool) {
	a.jevMu.Lock()
	defer a.jevMu.Unlock()
	if a.jevBad == nil {
		a.jevBad = map[string]bool{}
	}
	a.jevBad[providerName(provider)] = bad
}

func (a *App) jevIsBad(provider string) bool {
	a.jevMu.Lock()
	defer a.jevMu.Unlock()
	return a.jevBad[providerName(provider)]
}

func (a *App) SuggestQuickAdd(title string, generation uint64) (smartadd.Suggestion, error) {
	if generation != a.quickGeneration.Load() {
		return smartadd.Suggestion{}, nil
	}
	return a.suggest(title, true)
}

// SuggestTask serves the main window, which has no quick-add generation.
func (a *App) SuggestTask(title string, askCategory bool) (smartadd.Suggestion, error) {
	return a.suggest(title, askCategory)
}

func (a *App) suggest(title string, askCategory bool) (smartadd.Suggestion, error) {
	var none smartadd.Suggestion
	if strings.TrimSpace(title) == "" {
		return none, nil
	}
	snap, e := a.store.Snapshot()
	if e != nil || !snap.Settings.SmartAdd {
		return none, e
	}
	ep := snap.Settings.JevEndpoint()
	key := a.jevKeyFor(ep.Provider)
	if key == "" {
		return none, nil
	}
	if a.jevIsBad(ep.Provider) {
		return smartadd.Suggestion{Invalid: true}, nil
	}
	client, e := a.jevFor(ep, key)
	if e != nil {
		log.Printf("jev: %v", e)
		return none, nil
	}
	limit := smartadd.MaxOpenTasks
	for attempt := 0; attempt < 2; attempt++ {
		r := smartadd.Build(snap, title, limit, askCategory)
		ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
		answers, e := client.Ask(ctx, r.State, r.Questions)
		cancel()
		switch {
		case e == nil:
			return smartadd.Decide(r, answers), nil
		case errors.Is(e, jev.ErrUnauthorized):
			a.setJevBad(ep.Provider, true)
			return smartadd.Suggestion{Invalid: true}, nil
		case errors.Is(e, jev.ErrTooLarge) && attempt == 0:
			limit = max(len(r.State.OpenTasks)/2, 1)
		default:
			log.Printf("jev: %v", e)
			return none, nil
		}
	}
	return none, nil
}

// GetJevStatus reports on provider, or on the provider in saved settings when it is "".
func (a *App) GetJevStatus(provider string) JevStatus {
	if a.jevKeys == nil || !a.jevKeys.Supported() {
		return JevStatus{}
	}
	if provider == "" && a.store != nil {
		if snap, e := a.store.Snapshot(); e == nil {
			provider = snap.Settings.JevProvider
		}
	}
	key := a.jevKeyFor(provider)
	st := JevStatus{Supported: true, Configured: key != "", Invalid: key != "" && a.jevIsBad(provider)}
	if len(key) >= 8 {
		st.Hint = key[len(key)-4:]
	}
	return st
}

func (a *App) saveJevKey(provider, key string) error {
	provider = providerName(provider)
	if !jevProviders[provider] {
		return errors.New("不明なJevプロバイダーです")
	}
	if a.jevKeys == nil || !a.jevKeys.Supported() {
		return errors.New("この環境では使えません")
	}
	keys := a.loadJevKeys()
	if key == "" {
		delete(keys, provider)
	} else {
		keys[provider] = key
	}
	var e error
	if len(keys) == 0 {
		e = a.jevKeys.Clear()
	} else {
		b, _ := json.Marshal(keys)
		e = a.jevKeys.Save(string(b))
	}
	if e != nil {
		return e
	}
	a.setJevBad(provider, false)
	a.emitJev()
	return nil
}

func (a *App) SetJevKey(provider, key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return errors.New("APIキーを入力してください")
	}
	return a.saveJevKey(provider, key)
}

func (a *App) ClearJevKey(provider string) error {
	if a.jevKeys == nil {
		return nil
	}
	return a.saveJevKey(provider, "")
}

// TestJevKey checks the endpoint as currently entered in the settings form, which may not
// be saved yet, with the key saved for its provider.
func (a *App) TestJevKey(ep jev.Endpoint) (string, error) {
	key := a.jevKeyFor(ep.Provider)
	if key == "" {
		return "", errors.New("APIキーが未設定です")
	}
	client, e := a.jevFor(ep, key)
	if e != nil {
		return "", e
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	e = client.Models(ctx)
	switch {
	case e == nil:
		a.setJevBad(ep.Provider, false)
		return "ok", nil
	case errors.Is(e, jev.ErrUnauthorized):
		a.setJevBad(ep.Provider, true)
		return "invalid", nil
	default:
		log.Printf("jev: %v", e)
		return "unreachable", nil
	}
}

func (a *App) emitJev() {
	if a.desktop != nil {
		a.desktop.Event.Emit("board:jev")
	}
}
