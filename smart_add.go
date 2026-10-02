package main

import (
	"context"
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

func (a *App) jevFor(key string) jevAPI {
	if a.newJev != nil {
		return a.newJev(key)
	}
	return jev.New(key)
}

func (a *App) jevKey() string {
	if a.jevKeys == nil || !a.jevKeys.Supported() {
		return ""
	}
	key, e := a.jevKeys.Load()
	if e != nil {
		log.Printf("jev key: %v", e)
		return ""
	}
	return key
}

func (a *App) SuggestQuickAdd(title string, generation uint64) (smartadd.Suggestion, error) {
	var none smartadd.Suggestion
	if generation != a.quickGeneration.Load() || strings.TrimSpace(title) == "" {
		return none, nil
	}
	snap, e := a.store.Snapshot()
	if e != nil || !snap.Settings.SmartAdd {
		return none, e
	}
	key := a.jevKey()
	if key == "" {
		return none, nil
	}
	if a.jevInvalid.Load() {
		return smartadd.Suggestion{Invalid: true}, nil
	}
	client := a.jevFor(key)
	limit := smartadd.MaxOpenTasks
	for attempt := 0; attempt < 2; attempt++ {
		r := smartadd.Build(snap, title, limit)
		ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
		answers, e := client.Ask(ctx, r.State, r.Questions)
		cancel()
		switch {
		case e == nil:
			return smartadd.Decide(r, answers), nil
		case errors.Is(e, jev.ErrUnauthorized):
			a.jevInvalid.Store(true)
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

func (a *App) GetJevStatus() JevStatus {
	if a.jevKeys == nil || !a.jevKeys.Supported() {
		return JevStatus{}
	}
	key := a.jevKey()
	st := JevStatus{Supported: true, Configured: key != "", Invalid: key != "" && a.jevInvalid.Load()}
	if len(key) >= 8 {
		st.Hint = key[len(key)-4:]
	}
	return st
}

func (a *App) SetJevKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return errors.New("APIキーを入力してください")
	}
	if a.jevKeys == nil || !a.jevKeys.Supported() {
		return errors.New("この環境では使えません")
	}
	if e := a.jevKeys.Save(key); e != nil {
		return e
	}
	a.jevInvalid.Store(false)
	a.emitJev()
	return nil
}

func (a *App) ClearJevKey() error {
	if a.jevKeys == nil {
		return nil
	}
	if e := a.jevKeys.Clear(); e != nil {
		return e
	}
	a.jevInvalid.Store(false)
	a.emitJev()
	return nil
}

func (a *App) TestJevKey() (string, error) {
	key := a.jevKey()
	if key == "" {
		return "", errors.New("APIキーが未設定です")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	e := a.jevFor(key).Models(ctx)
	switch {
	case e == nil:
		a.jevInvalid.Store(false)
		return "ok", nil
	case errors.Is(e, jev.ErrUnauthorized):
		a.jevInvalid.Store(true)
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
