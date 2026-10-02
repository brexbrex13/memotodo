package main

import (
	"context"
	"encoding/json"
	"errors"
	"memotodo/internal/board"
	"memotodo/internal/jev"
	"memotodo/internal/smartadd"
	"strings"
	"testing"
)

type memKeys struct {
	key       string
	supported bool
}

func (m *memKeys) Supported() bool       { return m.supported }
func (m *memKeys) Load() (string, error) { return m.key, nil }
func (m *memKeys) Save(key string) error { m.key = key; return nil }
func (m *memKeys) Clear() error          { m.key = ""; return nil }

type fakeJev struct {
	keys    []string
	sent    []int
	answers map[string]jev.Answer
	errs    []error
	models  error
}

func (f *fakeJev) Ask(_ context.Context, state any, _ map[string]jev.Question) (map[string]jev.Answer, error) {
	f.sent = append(f.sent, len(state.(smartadd.State).OpenTasks))
	if len(f.errs) > 0 {
		e := f.errs[0]
		f.errs = f.errs[1:]
		if e != nil {
			return nil, e
		}
	}
	return f.answers, nil
}
func (f *fakeJev) Models(context.Context) error { return f.models }

func smartApp(t *testing.T, smart bool, key string) (*App, *fakeJev) {
	t.Helper()
	s, e := board.Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { s.Close() })
	v := board.Defaults()
	v.SmartAdd = smart
	if e = s.SaveSettings(v); e != nil {
		t.Fatal(e)
	}
	f := &fakeJev{answers: map[string]jev.Answer{"important": {Noul: 0.99}}}
	a := &App{store: s, jevKeys: &memKeys{key: key, supported: true}}
	a.newJev = func(k string) jevAPI { f.keys = append(f.keys, k); return f }
	return a, f
}

func TestSuggestQuickAddReturnsDecision(t *testing.T) {
	a, f := smartApp(t, true, "k1")
	s, e := a.SuggestQuickAdd("大事な用事", 0)
	if e != nil || !s.Important || len(f.sent) != 1 || f.keys[0] != "k1" {
		t.Fatalf("%+v %v %v", s, e, f.sent)
	}
}

func TestSuggestQuickAddIsSilentWhenDisabled(t *testing.T) {
	for _, tc := range []struct {
		smart bool
		key   string
		gen   uint64
		title string
	}{
		{false, "k", 0, "x"},
		{true, "", 0, "x"},
		{true, "k", 9, "x"},
		{true, "k", 0, "   "},
	} {
		a, f := smartApp(t, tc.smart, tc.key)
		s, e := a.SuggestQuickAdd(tc.title, tc.gen)
		if e != nil || s != (smartadd.Suggestion{}) || len(f.sent) != 0 {
			t.Fatalf("%+v: %+v %v %v", tc, s, e, f.sent)
		}
	}
}

func TestSuggestQuickAddHalvesTasksOnceWhenTooLarge(t *testing.T) {
	a, f := smartApp(t, true, "k")
	for _, title := range []string{"a", "b", "c", "d"} {
		if _, e := a.store.SaveTask(board.Task{Title: title, Status: "pending"}); e != nil {
			t.Fatal(e)
		}
	}
	f.errs = []error{jev.ErrTooLarge, nil}
	s, e := a.SuggestQuickAdd("x", 0)
	if e != nil || !s.Important || len(f.sent) != 2 || f.sent[0] != 4 || f.sent[1] != 2 {
		t.Fatalf("%+v %v %v", s, e, f.sent)
	}
	f.sent, f.errs = nil, []error{jev.ErrTooLarge, jev.ErrTooLarge}
	s, e = a.SuggestQuickAdd("y", 0)
	if e != nil || s != (smartadd.Suggestion{}) || len(f.sent) != 2 {
		t.Fatalf("%+v %v %v", s, e, f.sent)
	}
}

func TestSuggestQuickAddSwallowsTransientErrors(t *testing.T) {
	a, f := smartApp(t, true, "k")
	f.errs = []error{errors.New("network down")}
	if s, e := a.SuggestQuickAdd("x", 0); e != nil || s != (smartadd.Suggestion{}) {
		t.Fatalf("%+v %v", s, e)
	}
}

func TestUnauthorizedKeyStaysInvalidUntilSavedAgain(t *testing.T) {
	a, f := smartApp(t, true, "bad")
	f.errs = []error{jev.ErrUnauthorized}
	if s, _ := a.SuggestQuickAdd("x", 0); !s.Invalid {
		t.Fatalf("%+v", s)
	}
	if s, _ := a.SuggestQuickAdd("x", 0); !s.Invalid || len(f.sent) != 1 {
		t.Fatal("asked again with an invalid key")
	}
	if !a.GetJevStatus().Invalid {
		t.Fatal("status not invalid")
	}
	if e := a.SetJevKey("  good-key-5678 \n"); e != nil {
		t.Fatal(e)
	}
	st := a.GetJevStatus()
	if st.Invalid || !st.Configured || st.Hint != "5678" || a.jevKeys.(*memKeys).key != "good-key-5678" {
		t.Fatalf("%+v", st)
	}
	if s, _ := a.SuggestQuickAdd("x", 0); s.Invalid || len(f.sent) != 2 {
		t.Fatalf("%+v", s)
	}
}

func TestSetJevKeyRejectsBlankAndClearWorks(t *testing.T) {
	a, _ := smartApp(t, true, "old-key-1234")
	if e := a.SetJevKey(" \n "); e == nil {
		t.Fatal("blank key accepted")
	}
	if e := a.ClearJevKey(); e != nil || a.GetJevStatus().Configured {
		t.Fatal(e)
	}
}

func TestJevStatusHidesShortKeysAndReportsUnsupported(t *testing.T) {
	a, _ := smartApp(t, true, "abc")
	if st := a.GetJevStatus(); !st.Configured || st.Hint != "" {
		t.Fatalf("%+v", st)
	}
	a.jevKeys = &memKeys{supported: false}
	if st := a.GetJevStatus(); st.Supported || st.Configured {
		t.Fatalf("%+v", st)
	}
	if st := (&App{}).GetJevStatus(); st.Supported {
		t.Fatalf("%+v", st)
	}
}

func TestTestJevKeyResults(t *testing.T) {
	a, f := smartApp(t, true, "k")
	for _, tc := range []struct {
		err  error
		want string
	}{{nil, "ok"}, {jev.ErrUnauthorized, "invalid"}, {errors.New("dns"), "unreachable"}} {
		f.models = tc.err
		if got, e := a.TestJevKey(); e != nil || got != tc.want {
			t.Fatal(tc.want, got, e)
		}
	}
	if !a.GetJevStatus().Invalid {
		t.Fatal("invalid not remembered")
	}
	a.jevKeys = &memKeys{supported: true}
	if _, e := a.TestJevKey(); e == nil {
		t.Fatal("no key accepted")
	}
}

func TestSnapshotNeverContainsKey(t *testing.T) {
	a, _ := smartApp(t, true, "tsk-secret-1234")
	v, e := a.GetSnapshot()
	if e != nil || !v.Settings.SmartAdd {
		t.Fatal(e)
	}
	b, _ := json.Marshal(v)
	if strings.Contains(string(b), "tsk-secret-1234") {
		t.Fatal("key in snapshot")
	}
}

func TestQuickAddHeight(t *testing.T) {
	for _, tc := range []struct {
		options bool
		rows    int
		want    int
	}{{false, 0, 105}, {false, 1, 131}, {false, 3, 183}, {false, 9, 183}, {false, -1, 105}, {true, 2, 430}} {
		if got := quickAddHeight(tc.options, tc.rows); got != tc.want {
			t.Fatal(tc, got)
		}
	}
}

func TestSuggestTaskIgnoresQuickAddGeneration(t *testing.T) {
	a, f := smartApp(t, true, "k")
	a.quickGeneration.Store(5)
	s, e := a.SuggestTask("大事な用事", false)
	if e != nil || !s.Important || len(f.sent) != 1 {
		t.Fatalf("%+v %v %v", s, e, f.sent)
	}
	if s, _ := a.SuggestTask("  ", true); s != (smartadd.Suggestion{}) || len(f.sent) != 1 {
		t.Fatal("blank title asked")
	}
}
