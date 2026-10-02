# スマートなクイック追加（Jev 連携） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** クイック追加でタイトルから「カテゴリ・重要・期限・通知」の初期値を Jev が1回のリクエストで推定して入れ、未完了タスクとの重複を警告する。APIキーは設定画面から DPAPI で暗号化して保存する。

**Architecture:** Go 側に Jev の薄い HTTP クライアント（`internal/jev`）と、質問の組み立て・閾値の判定をする純粋関数（`internal/smartadd`）を置く。`App` はキーの保存（DPAPI、`jevkey_*.go`）と Wails メソッドの公開だけを担う。フロントはチップ表示と「手で触った欄は上書きしない」反映ロジック（`smartAdd.ts`、純粋関数）を持ち、`QuickAdd.tsx` は呼び出しと表示だけを行う。

**Tech Stack:** Go 1.25（`golang.org/x/sys/windows` の `CryptProtectData`）、Wails v3（`Call.ByName("main.App.X")`）、React 18 + TypeScript、vitest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-10-03-jev-smart-quick-add-design.md`

## Global Constraints

- Jev API: `POST https://api.typesafe.ai/v1/systemone`、`GET https://api.typesafe.ai/v1/models`、`Authorization: Bearer <key>`、モデルは `jev-latest` 固定。
- noul の criteria は `{"true": "...", "false": "..."}` を `criteria` の中に入れ子で送る。
- choice の候補は1問あたり255個まで。未完了タスクは最大200件。
- 推定のタイムアウトは1.5秒、接続テストは5秒。
- 閾値: category 0.80 / important 0.85 / deadline 0.80 / reminder 0.85 / duplicate 0.70。
- 外部に送るのは「入力中のタイトル、休眠していないカテゴリ名、未完了タスクのタイトル」だけ。メモ・期限・完了済みは送らない。
- APIキーは Go の外に出さない。`Snapshot`・`Settings`・バックアップに含めない。保存先は `<データフォルダ>/jev.key`（DPAPI、ユーザー単位）。
- キー未設定・`smart_add` オフ・通信失敗のときは、今とまったく同じ動きにする。
- テストは実際の Jev API を呼ばない。
- UI の文言は日本語。コミットメッセージは英語の命令形1行（既存の履歴に合わせる）＋ attribution 行。
- 既存のコードの書き方に合わせる（Go はコメント少なめ・短い変数名、TS は prettier 整形）。

## Review Focus

- 推定で入れたカテゴリが、登録までの間に削除された → `SaveTask` が「カテゴリが見つかりません」で失敗し、タスクが消える。期待: 既定のカテゴリで登録される（Task 6 にテストを追加）。
- カテゴリ名・タスク名に `"`・`\`・改行・絵文字が入っている → 順序を保つ choice の JSON を手で組み立てているので、壊れた JSON になる恐れがある。期待: 正しくエスケープされる（Task 1 にテストを追加）。
- カテゴリが255個以上ある → choice の上限を超えて 400 になり、推定が毎回失敗する。期待: 254個に切り詰めて送る（Task 2 にテストを追加）。
- 貼り付けた APIキーの前後に空白や改行が入っている → そのまま保存すると 401 になる。期待: 前後の空白を除いて保存する（Task 4 にテストを追加）。
- 推定で「期限日に通知」が入った後、ユーザーがチップの ✕ で期限を外した → 期限の無い「期限日に通知」が残って登録時にエラーになる恐れがある。期待: 通知も一緒に外れる（Task 5 にテストを追加）。

---

## File Structure

| ファイル | 種別 | 責務 |
| --- | --- | --- |
| `internal/jev/jev.go` | 新規 | Jev の HTTP クライアント・質問の型・エラーの振り分け |
| `internal/jev/jev_test.go` | 新規 | ワイヤ形式・エラー・タイムアウト |
| `internal/smartadd/smartadd.go` | 新規 | `Build`（質問の組み立て）・`Decide`（閾値の判定） |
| `internal/smartadd/smartadd_test.go` | 新規 | 組み立てと判定 |
| `jevkey.go` | 新規 | `keyStore` インターフェース |
| `jevkey_windows.go` | 新規 | DPAPI 実装 |
| `jevkey_other.go` | 新規 | Windows 以外（未対応） |
| `jevkey_windows_test.go` | 新規 | 保存・読み出し・削除・壊れたファイル・バックアップに入らないこと |
| `smart_add.go` | 新規 | `App` の Jev 関連メソッド |
| `smart_add_test.go` | 新規 | `App` のメソッドのテスト（偽の keyStore と Jev） |
| `app.go` | 変更 | `App` にフィールド追加、`SetQuickAddLayout` に行数を追加 |
| `main.go` | 変更 | `jevKeys` の配線 |
| `internal/board/models.go` | 変更 | `Settings.SmartAdd` |
| `frontend/src/smartAdd.ts` | 新規 | 型・期限日の計算・反映・チップ |
| `frontend/src/smartAdd.test.ts` | 新規 | 上記の単体テスト |
| `frontend/src/QuickAdd.tsx` | 変更 | 推定の呼び出し・チップ・警告 |
| `frontend/src/quickAdd.test.tsx` | 変更 | クイック追加の振る舞いのテスト追加 |
| `frontend/src/JevKeyField.tsx` | 新規 | 設定画面のキー欄 |
| `frontend/src/jevKeyField.test.tsx` | 新規 | キー欄のテスト |
| `frontend/src/SettingsForm.tsx` | 変更 | 見出しとチェックボックス、`JevKeyField` |
| `frontend/src/types.ts` | 変更 | `Settings.smart_add` |
| `frontend/src/styles/todo.css` | 変更 | チップ・警告・キー欄 |
| `README.md` | 変更 | 主な機能に1行 |

---

### Task 1: Jev クライアント（`internal/jev`）

**Files:**
- Create: `internal/jev/jev.go`
- Test: `internal/jev/jev_test.go`

**Interfaces:**
- Consumes: なし
- Produces:
  - `var ErrUnauthorized, ErrTooLarge error`
  - `type Option struct { Key, Description string }`
  - `type Question struct { Type string; Instructions string; Criteria json.RawMessage }`
  - `func Noul(instructions, whenTrue, whenFalse string) Question`
  - `func Choice(instructions string, options []Option) Question` — 候補の順序を保つ。`Description` が空なら JSON の `null`
  - `type Answer struct { Type string; Noul, Confidence, Score float64; Choice string; Probabilities map[string]float64 }`
  - `type Client struct { BaseURL, Key, Model string; HTTP *http.Client }`
  - `func New(key string) *Client`
  - `func (c *Client) Ask(ctx context.Context, state any, questions map[string]Question) (map[string]Answer, error)`
  - `func (c *Client) Models(ctx context.Context) error`

- [ ] **Step 1: 失敗するテストを書く**

`internal/jev/jev_test.go`:

```go
package jev

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func serve(t *testing.T, status int, body string, seen *[]byte, header *http.Header) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if seen != nil {
			*seen, _ = io.ReadAll(r.Body)
		}
		if header != nil {
			*header = r.Header.Clone()
			(*header).Set("X-Path", r.Method+" "+r.URL.Path)
		}
		w.WriteHeader(status)
		io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	c := New("secret-key")
	c.BaseURL = srv.URL
	return c
}

func TestAskSendsWireFormat(t *testing.T) {
	var body []byte
	var header http.Header
	c := serve(t, 200, `{"model":"jev-latest","answers":{"cat":{"type":"choice","choice":"b","confidence":0.9,"probabilities":{"b":0.9}},"imp":{"type":"noul","noul":0.7}}}`, &body, &header)
	got, e := c.Ask(context.Background(), map[string]string{"input": "x"}, map[string]Question{
		"cat": Choice("which", []Option{{Key: "z"}, {Key: "b", Description: "desc"}}),
		"imp": Noul("important", "yes", "no"),
	})
	if e != nil {
		t.Fatal(e)
	}
	if header.Get("Authorization") != "Bearer secret-key" || header.Get("X-Path") != "POST /v1/systemone" {
		t.Fatal(header)
	}
	s := string(body)
	for _, want := range []string{
		`"model":"jev-latest"`,
		`"criteria":{"z":null,"b":"desc"}`,
		`"criteria":{"false":"no","true":"yes"}`,
		`"state":{"input":"x"}`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("%s not in %s", want, s)
		}
	}
	if got["cat"].Choice != "b" || got["cat"].Confidence != 0.9 || got["imp"].Noul != 0.7 {
		t.Fatal(got)
	}
}

func TestChoiceEscapesKeysAndDescriptions(t *testing.T) {
	q := Choice("i", []Option{{Key: "a\"b\\c\n😀"}, {Key: "<x>", Description: "line\n\"q\""}})
	var m map[string]any
	if e := json.Unmarshal(q.Criteria, &m); e != nil {
		t.Fatal(e, string(q.Criteria))
	}
	if _, ok := m["a\"b\\c\n😀"]; !ok || m["<x>"] != "line\n\"q\"" {
		t.Fatal(m)
	}
}

func TestErrorsAreClassified(t *testing.T) {
	cases := []struct {
		status int
		body   string
		want   error
	}{
		{401, `{}`, ErrUnauthorized},
		{403, `{}`, ErrUnauthorized},
		{400, `{"detail":{"error_type":"max_tokens_exceeded"}}`, ErrTooLarge},
	}
	for _, tc := range cases {
		_, e := serve(t, tc.status, tc.body, nil, nil).Ask(context.Background(), "s", map[string]Question{})
		if !errors.Is(e, tc.want) {
			t.Fatal(tc.status, e)
		}
	}
	_, e := serve(t, 500, `oops`, nil, nil).Ask(context.Background(), "s", map[string]Question{})
	if e == nil || errors.Is(e, ErrUnauthorized) || errors.Is(e, ErrTooLarge) {
		t.Fatal(e)
	}
	_, e = serve(t, 200, `not json`, nil, nil).Ask(context.Background(), "s", map[string]Question{})
	if e == nil {
		t.Fatal("bad body accepted")
	}
}

func TestModelsUsesGet(t *testing.T) {
	var header http.Header
	if e := serve(t, 200, `[]`, nil, &header).Models(context.Background()); e != nil {
		t.Fatal(e)
	}
	if header.Get("X-Path") != "GET /v1/models" || header.Get("Authorization") != "Bearer secret-key" {
		t.Fatal(header)
	}
	if e := serve(t, 401, `{}`, nil, nil).Models(context.Background()); !errors.Is(e, ErrUnauthorized) {
		t.Fatal(e)
	}
}

func TestAskHonoursContextDeadline(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
	}))
	defer srv.Close()
	c := New("k")
	c.BaseURL = srv.URL
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, e := c.Ask(ctx, "s", map[string]Question{}); !errors.Is(e, context.DeadlineExceeded) {
		t.Fatal(e)
	}
}
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `go test ./internal/jev/`
Expected: FAIL（`undefined: New` などのコンパイルエラー）

- [ ] **Step 3: 実装する**

`internal/jev/jev.go`:

```go
// Package jev is a minimal client for TypeSafe AI's Jev decision model.
package jev

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

var (
	ErrUnauthorized = errors.New("jev: unauthorized")
	ErrTooLarge     = errors.New("jev: request too large")
)

type Option struct{ Key, Description string }

type Question struct {
	Type         string          `json:"type"`
	Instructions string          `json:"instructions"`
	Criteria     json.RawMessage `json:"criteria,omitempty"`
}

// Noul criteria must be nested; top-level true/false are silently ignored by the API.
func Noul(instructions, whenTrue, whenFalse string) Question {
	b, _ := json.Marshal(map[string]string{"true": whenTrue, "false": whenFalse})
	return Question{Type: "noul", Instructions: instructions, Criteria: b}
}

// Choice keeps option order, which affects answers when there are few options.
// An empty description is sent as null so the option is judged by its name.
func Choice(instructions string, options []Option) Question {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, o := range options {
		if i > 0 {
			b.WriteByte(',')
		}
		k, _ := json.Marshal(o.Key)
		b.Write(k)
		b.WriteByte(':')
		if o.Description == "" {
			b.WriteString("null")
		} else {
			d, _ := json.Marshal(o.Description)
			b.Write(d)
		}
	}
	b.WriteByte('}')
	return Question{Type: "choice", Instructions: instructions, Criteria: b.Bytes()}
}

type Answer struct {
	Type          string             `json:"type"`
	Noul          float64            `json:"noul"`
	Choice        string             `json:"choice"`
	Confidence    float64            `json:"confidence"`
	Score         float64            `json:"score"`
	Probabilities map[string]float64 `json:"probabilities"`
}

type Client struct {
	BaseURL string
	Key     string
	Model   string
	HTTP    *http.Client
}

func New(key string) *Client {
	return &Client{BaseURL: "https://api.typesafe.ai", Key: key, Model: "jev-latest", HTTP: http.DefaultClient}
}

func (c *Client) Ask(ctx context.Context, state any, questions map[string]Question) (map[string]Answer, error) {
	body, e := json.Marshal(map[string]any{"model": c.Model, "state": state, "questions": questions})
	if e != nil {
		return nil, e
	}
	var out struct {
		Answers map[string]Answer `json:"answers"`
	}
	if e = c.do(ctx, http.MethodPost, "/v1/systemone", body, &out); e != nil {
		return nil, e
	}
	return out.Answers, nil
}

func (c *Client) Models(ctx context.Context) error {
	return c.do(ctx, http.MethodGet, "/v1/models", nil, nil)
}

func (c *Client) do(ctx context.Context, method, path string, body []byte, out any) error {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, e := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, reader)
	if e != nil {
		return e
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, e := c.HTTP.Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	b, e := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if e != nil {
		return e
	}
	switch {
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		return ErrUnauthorized
	case res.StatusCode == http.StatusBadRequest && bytes.Contains(b, []byte("max_tokens_exceeded")):
		return ErrTooLarge
	case res.StatusCode/100 != 2:
		return fmt.Errorf("jev: HTTP %d: %s", res.StatusCode, b[:min(len(b), 200)])
	}
	if out == nil {
		return nil
	}
	if e = json.Unmarshal(b, out); e != nil {
		return fmt.Errorf("jev: bad response: %w", e)
	}
	return nil
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `go test ./internal/jev/ && go vet ./internal/jev/`
Expected: `ok  memotodo/internal/jev`、vet の出力なし

- [ ] **Step 5: コミット**

```bash
git add internal/jev
git commit -m "Add a minimal Jev API client"
```

---

### Task 2: 質問の組み立てと判定（`internal/smartadd`）

**Files:**
- Create: `internal/smartadd/smartadd.go`
- Test: `internal/smartadd/smartadd_test.go`

**Interfaces:**
- Consumes: Task 1 の `jev.Question`・`jev.Option`・`jev.Noul`・`jev.Choice`・`jev.Answer`、既存の `board.Snapshot`・`board.Task`・`board.Category`
- Produces:
  - 定数 `CategoryMin=0.80, ImportantMin=0.85, DeadlineMin=0.80, ReminderMin=0.85, DuplicateMin=0.70, MaxOpenTasks=200`
  - `type Dup struct { TaskID int64 \`json:"task_id"\`; Title string \`json:"title"\` }`
  - `type Suggestion struct { CategoryID int64 \`json:"category_id"\`; Important bool \`json:"important"\`; Deadline string \`json:"deadline"\`; Reminder string \`json:"reminder"\`; Duplicate *Dup \`json:"duplicate"\`; Invalid bool \`json:"invalid"\` }`
  - `type State struct { Input string \`json:"input"\`; Categories []string \`json:"categories"\`; OpenTasks []string \`json:"open_tasks"\` }`
  - `type Request struct { State State; Questions map[string]jev.Question; /* 非公開フィールド */ }`
  - `func Build(s board.Snapshot, title string, limit int) Request`
  - `func Decide(r Request, answers map[string]jev.Answer) Suggestion` — `answers` が nil でも動く（手元で見つけた完全一致の重複だけ返す）

- [ ] **Step 1: 失敗するテストを書く**

`internal/smartadd/smartadd_test.go`:

```go
package smartadd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"memotodo/internal/board"
	"memotodo/internal/jev"
	"testing"
)

func snap() board.Snapshot {
	return board.Snapshot{
		Categories: []board.Category{
			{ID: 3, Name: "家", SortOrder: 2},
			{ID: 1, Name: "仕事", SortOrder: 1},
			{ID: 2, Name: "休眠", SortOrder: 0, Dormant: true},
			{ID: 4, Name: "仕事", SortOrder: 3},
			{ID: 5, Name: "  ", SortOrder: 4},
		},
		Tasks: []board.Task{
			{ID: 10, Title: "古い", Status: "pending", CreatedAt: "2026-01-01T00:00:00"},
			{ID: 11, Title: "請求書提出", Status: "pending", CreatedAt: "2026-02-01T00:00:00"},
			{ID: 12, Title: "完了済み", Status: "done", CreatedAt: "2026-03-01T00:00:00"},
			{ID: 13, Title: "削除済み", Status: "pending", DeletedAt: "2026-03-02T00:00:00", CreatedAt: "2026-03-01T00:00:00"},
		},
	}
}

func criteria(t *testing.T, q jev.Question) []string {
	t.Helper()
	var keys []string
	dec := json.NewDecoder(bytes.NewReader(q.Criteria))
	dec.Token()
	for dec.More() {
		k, _ := dec.Token()
		keys = append(keys, k.(string))
		var skip any
		dec.Decode(&skip)
	}
	return keys
}

func TestBuildCategoriesSkipDormantBlankAndDuplicateNames(t *testing.T) {
	r := Build(snap(), " 請求書を経理に ", MaxOpenTasks)
	if fmt.Sprint(r.State.Categories) != "[仕事 家]" || r.State.Input != "請求書を経理に" {
		t.Fatal(r.State)
	}
	if got := fmt.Sprint(criteria(t, r.Questions["category"])); got != "[仕事 家 none_of_these]" {
		t.Fatal(got)
	}
	if r.categories["仕事"] != 1 {
		t.Fatal(r.categories)
	}
}

func TestBuildOmitsCategoryQuestionWithOneCategory(t *testing.T) {
	s := snap()
	s.Categories = s.Categories[:1]
	if _, ok := Build(s, "x", MaxOpenTasks).Questions["category"]; ok {
		t.Fatal("category asked with one category")
	}
}

func TestBuildCapsCategoriesAt254(t *testing.T) {
	s := board.Snapshot{}
	for i := 1; i <= 300; i++ {
		s.Categories = append(s.Categories, board.Category{ID: int64(i), Name: fmt.Sprintf("c%d", i), SortOrder: i})
	}
	if n := len(criteria(t, Build(s, "x", MaxOpenTasks).Questions["category"])); n != 255 {
		t.Fatal(n)
	}
}

func TestBuildOpenTasksNewestFirstAndLimited(t *testing.T) {
	r := Build(snap(), "別の用事", 1)
	if fmt.Sprint(r.State.OpenTasks) != "[請求書提出]" {
		t.Fatal(r.State.OpenTasks)
	}
	if got := fmt.Sprint(criteria(t, r.Questions["duplicate"])); got != "[t11 none]" {
		t.Fatal(got)
	}
	if fmt.Sprint(Build(snap(), "別の用事", MaxOpenTasks).State.OpenTasks) != "[請求書提出 古い]" {
		t.Fatal("order")
	}
}

func TestBuildOmitsDuplicateQuestionWithoutOpenTasks(t *testing.T) {
	s := snap()
	s.Tasks = nil
	if _, ok := Build(s, "x", MaxOpenTasks).Questions["duplicate"]; ok {
		t.Fatal("duplicate asked without tasks")
	}
}

func TestExactTitleMatchIsFoundLocallyEvenBeyondLimit(t *testing.T) {
	r := Build(snap(), " 古い ", 1)
	if _, ok := r.Questions["duplicate"]; ok {
		t.Fatal("asked although exact match is known")
	}
	s := Decide(r, nil)
	if s.Duplicate == nil || s.Duplicate.TaskID != 10 {
		t.Fatal(s.Duplicate)
	}
}

func TestDecideAppliesThresholdsAndEscapes(t *testing.T) {
	r := Build(snap(), "請求書を経理に", MaxOpenTasks)
	s := Decide(r, map[string]jev.Answer{
		"category":  {Choice: "仕事", Confidence: CategoryMin},
		"important": {Noul: ImportantMin},
		"deadline":  {Choice: "tomorrow", Confidence: DeadlineMin},
		"reminder":  {Choice: "deadline", Confidence: ReminderMin},
		"duplicate": {Choice: "t11", Confidence: DuplicateMin},
	})
	if s.CategoryID != 1 || !s.Important || s.Deadline != "tomorrow" || s.Reminder != "deadline" || s.Duplicate == nil || s.Duplicate.Title != "請求書提出" {
		t.Fatalf("%+v", s)
	}
	s = Decide(r, map[string]jev.Answer{
		"category":  {Choice: "仕事", Confidence: CategoryMin - 0.01},
		"important": {Noul: ImportantMin - 0.01},
		"deadline":  {Choice: "tomorrow", Confidence: DeadlineMin - 0.01},
		"reminder":  {Choice: "1h", Confidence: ReminderMin - 0.01},
		"duplicate": {Choice: "t11", Confidence: DuplicateMin - 0.01},
	})
	if s != (Suggestion{}) {
		t.Fatalf("%+v", s)
	}
	s = Decide(r, map[string]jev.Answer{
		"category":  {Choice: "none_of_these", Confidence: 1},
		"deadline":  {Choice: "none", Confidence: 1},
		"reminder":  {Choice: "off", Confidence: 1},
		"duplicate": {Choice: "none", Confidence: 1},
	})
	if s != (Suggestion{}) {
		t.Fatalf("%+v", s)
	}
}

func TestDecideIgnoresUnknownChoicesAndOrphanDeadlineReminder(t *testing.T) {
	r := Build(snap(), "x", MaxOpenTasks)
	s := Decide(r, map[string]jev.Answer{
		"category":  {Choice: "存在しない", Confidence: 1},
		"deadline":  {Choice: "yesterday", Confidence: 1},
		"reminder":  {Choice: "deadline", Confidence: 1},
		"duplicate": {Choice: "t999", Confidence: 1},
	})
	if s != (Suggestion{}) {
		t.Fatalf("%+v", s)
	}
}
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `go test ./internal/smartadd/`
Expected: FAIL（`undefined: Build` などのコンパイルエラー）

- [ ] **Step 3: 実装する**

`internal/smartadd/smartadd.go`:

```go
// Package smartadd turns a quick-add title into Jev questions and applies
// confidence thresholds to the answers.
package smartadd

import (
	"fmt"
	"memotodo/internal/board"
	"memotodo/internal/jev"
	"sort"
	"strings"
)

const (
	CategoryMin  = 0.80
	ImportantMin = 0.85
	DeadlineMin  = 0.80
	ReminderMin  = 0.85
	DuplicateMin = 0.70
	MaxOpenTasks = 200
	maxChoices   = 255
	noneCategory = "none_of_these"
)

type Dup struct {
	TaskID int64  `json:"task_id"`
	Title  string `json:"title"`
}

type Suggestion struct {
	CategoryID int64  `json:"category_id"`
	Important  bool   `json:"important"`
	Deadline   string `json:"deadline"`
	Reminder   string `json:"reminder"`
	Duplicate  *Dup   `json:"duplicate"`
	Invalid    bool   `json:"invalid"`
}

type State struct {
	Input      string   `json:"input"`
	Categories []string `json:"categories"`
	OpenTasks  []string `json:"open_tasks"`
}

type Request struct {
	State      State
	Questions  map[string]jev.Question
	categories map[string]int64
	tasks      map[string]Dup
	exact      *Dup
}

var deadlineOptions = []jev.Option{
	{Key: "none", Description: "期限の手掛かりが無い"},
	{Key: "today", Description: "今日中"},
	{Key: "tomorrow", Description: "明日まで"},
	{Key: "this_week", Description: "今週中"},
	{Key: "next_week", Description: "来週中"},
}

var reminderOptions = []jev.Option{
	{Key: "off", Description: "通知は要らない"},
	{Key: "deadline", Description: "期限日に通知する"},
	{Key: "1h", Description: "1時間後に通知する"},
	{Key: "4h", Description: "4時間後に通知する"},
	{Key: "tomorrow", Description: "明日の朝に通知する"},
	{Key: "next-week", Description: "来週の初めに通知する"},
}

func Build(s board.Snapshot, title string, limit int) Request {
	title = strings.TrimSpace(title)
	r := Request{
		State:      State{Input: title, Categories: []string{}, OpenTasks: []string{}},
		Questions:  map[string]jev.Question{},
		categories: map[string]int64{},
		tasks:      map[string]Dup{},
	}
	cats := append([]board.Category(nil), s.Categories...)
	sort.SliceStable(cats, func(i, j int) bool {
		if cats[i].SortOrder != cats[j].SortOrder {
			return cats[i].SortOrder < cats[j].SortOrder
		}
		return cats[i].ID < cats[j].ID
	})
	var catOptions []jev.Option
	for _, c := range cats {
		name := strings.TrimSpace(c.Name)
		if c.Dormant || name == "" || name == noneCategory || len(catOptions) == maxChoices-1 {
			continue
		}
		if _, seen := r.categories[name]; seen {
			continue
		}
		r.categories[name] = c.ID
		r.State.Categories = append(r.State.Categories, name)
		catOptions = append(catOptions, jev.Option{Key: name})
	}
	if len(catOptions) > 1 {
		r.Questions["category"] = jev.Choice("入力されたタスク(input)を入れるカテゴリ。どれにも当てはまらなければ none_of_these。",
			append(catOptions, jev.Option{Key: noneCategory, Description: "どのカテゴリにも当てはまらない"}))
	}
	r.Questions["important"] = jev.Noul("入力されたタスク(input)は重要である。", "締切や他人への影響が大きく、優先して扱うべき用事", "日常的な、通常の用事")
	r.Questions["deadline"] = jev.Choice("入力されたタスク(input)の文面から読み取れる期限。読み取れなければ none。", deadlineOptions)
	r.Questions["reminder"] = jev.Choice("入力されたタスク(input)に付けるべき通知。特に要らなければ off。", reminderOptions)

	var open []board.Task
	for _, t := range s.Tasks {
		if t.Status == "pending" && t.DeletedAt == "" && strings.TrimSpace(t.Title) != "" {
			open = append(open, t)
		}
	}
	sort.SliceStable(open, func(i, j int) bool {
		if open[i].CreatedAt != open[j].CreatedAt {
			return open[i].CreatedAt > open[j].CreatedAt
		}
		return open[i].ID > open[j].ID
	})
	for _, t := range open {
		if strings.EqualFold(strings.TrimSpace(t.Title), title) {
			r.exact = &Dup{TaskID: t.ID, Title: t.Title}
			break
		}
	}
	limit = min(limit, MaxOpenTasks)
	if len(open) > limit {
		open = open[:max(limit, 0)]
	}
	options := make([]jev.Option, 0, len(open)+1)
	for _, t := range open {
		key := fmt.Sprintf("t%d", t.ID)
		r.tasks[key] = Dup{TaskID: t.ID, Title: t.Title}
		r.State.OpenTasks = append(r.State.OpenTasks, t.Title)
		options = append(options, jev.Option{Key: key, Description: t.Title})
	}
	if r.exact == nil && len(options) > 0 {
		r.Questions["duplicate"] = jev.Choice("入力されたタスク(input)と同じ用事を指す、既存の未完了タスク。同じ用事が無ければ none。",
			append(options, jev.Option{Key: "none", Description: "同じ用事のタスクは無い"}))
	}
	return r
}

func Decide(r Request, answers map[string]jev.Answer) Suggestion {
	var s Suggestion
	if a, ok := answers["category"]; ok && a.Confidence >= CategoryMin {
		s.CategoryID = r.categories[a.Choice]
	}
	if a, ok := answers["important"]; ok && a.Noul >= ImportantMin {
		s.Important = true
	}
	if a, ok := answers["deadline"]; ok && a.Confidence >= DeadlineMin && known(deadlineOptions, a.Choice) && a.Choice != "none" {
		s.Deadline = a.Choice
	}
	if a, ok := answers["reminder"]; ok && a.Confidence >= ReminderMin && known(reminderOptions, a.Choice) && a.Choice != "off" {
		s.Reminder = a.Choice
	}
	if s.Reminder == "deadline" && s.Deadline == "" {
		s.Reminder = ""
	}
	if r.exact != nil {
		d := *r.exact
		s.Duplicate = &d
	} else if a, ok := answers["duplicate"]; ok && a.Confidence >= DuplicateMin {
		if d, ok := r.tasks[a.Choice]; ok {
			s.Duplicate = &d
		}
	}
	return s
}

func known(options []jev.Option, key string) bool {
	for _, o := range options {
		if o.Key == key {
			return true
		}
	}
	return false
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `go test ./internal/smartadd/ && go vet ./internal/smartadd/`
Expected: `ok  memotodo/internal/smartadd`、vet の出力なし

- [ ] **Step 5: コミット**

```bash
git add internal/smartadd
git commit -m "Build Jev questions and decisions for smart quick add"
```

---

### Task 3: APIキーの保存（DPAPI）

**Files:**
- Create: `jevkey.go`, `jevkey_windows.go`, `jevkey_other.go`
- Test: `jevkey_windows_test.go`

**Interfaces:**
- Consumes: 既存の `board.Open`・`(*board.Store).Backup`
- Produces:
  - `type keyStore interface { Supported() bool; Load() (string, error); Save(key string) error; Clear() error }`
  - `func newKeyStore(dir string) keyStore` — Windows では `<dir>/jev.key` に DPAPI で保存。それ以外では未対応
  - `Load` はファイルが無い・復号できないとき `"", nil` を返す

- [ ] **Step 1: 失敗するテストを書く**

`jevkey_windows_test.go`:

```go
//go:build windows

package main

import (
	"archive/zip"
	"io"
	"memotodo/internal/board"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDPAPIKeyStoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	k := newKeyStore(dir)
	if !k.Supported() {
		t.Fatal("unsupported on windows")
	}
	if v, e := k.Load(); e != nil || v != "" {
		t.Fatal(v, e)
	}
	if e := k.Save("tsk-secret-1234"); e != nil {
		t.Fatal(e)
	}
	raw, e := os.ReadFile(filepath.Join(dir, "jev.key"))
	if e != nil || strings.Contains(string(raw), "tsk-secret-1234") {
		t.Fatal("key stored in plain text", e)
	}
	if v, e := k.Load(); e != nil || v != "tsk-secret-1234" {
		t.Fatal(v, e)
	}
	if e := k.Clear(); e != nil {
		t.Fatal(e)
	}
	if e := k.Clear(); e != nil {
		t.Fatal("second clear", e)
	}
	if v, _ := k.Load(); v != "" {
		t.Fatal(v)
	}
}

func TestDPAPIKeyStoreTreatsCorruptFileAsMissing(t *testing.T) {
	dir := t.TempDir()
	if e := os.WriteFile(filepath.Join(dir, "jev.key"), []byte("garbage"), 0o600); e != nil {
		t.Fatal(e)
	}
	if v, e := newKeyStore(dir).Load(); e != nil || v != "" {
		t.Fatal(v, e)
	}
}

func TestBackupExcludesJevKey(t *testing.T) {
	s, e := board.Open(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	if e = newKeyStore(s.Dir).Save("tsk-secret-1234"); e != nil {
		t.Fatal(e)
	}
	path, e := s.Backup()
	if e != nil {
		t.Fatal(e)
	}
	z, e := zip.OpenReader(path)
	if e != nil {
		t.Fatal(e)
	}
	defer z.Close()
	for _, f := range z.File {
		if strings.Contains(f.Name, "jev") {
			t.Fatal(f.Name)
		}
		r, _ := f.Open()
		b, _ := io.ReadAll(r)
		r.Close()
		if strings.Contains(string(b), "tsk-secret-1234") {
			t.Fatal("key in backup", f.Name)
		}
	}
}
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `go test -run "DPAPI|BackupExcludesJevKey" .`
Expected: FAIL（`undefined: newKeyStore`）

- [ ] **Step 3: 実装する**

`jevkey.go`:

```go
package main

// keyStore keeps the Jev API key outside settings, snapshots and backups.
type keyStore interface {
	Supported() bool
	Load() (string, error)
	Save(key string) error
	Clear() error
}
```

`jevkey_windows.go`:

```go
//go:build windows

package main

import (
	"errors"
	"log"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

type dpapiKeyStore struct{ path string }

func newKeyStore(dir string) keyStore { return dpapiKeyStore{filepath.Join(dir, "jev.key")} }

func (dpapiKeyStore) Supported() bool { return true }

func (k dpapiKeyStore) Save(key string) error {
	b := []byte(key)
	if len(b) == 0 {
		return errors.New("APIキーを入力してください")
	}
	in := windows.DataBlob{Size: uint32(len(b)), Data: &b[0]}
	var out windows.DataBlob
	if e := windows.CryptProtectData(&in, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); e != nil {
		return e
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	return os.WriteFile(k.path, unsafe.Slice(out.Data, out.Size), 0o600)
}

func (k dpapiKeyStore) Load() (string, error) {
	b, e := os.ReadFile(k.path)
	if errors.Is(e, os.ErrNotExist) || (e == nil && len(b) == 0) {
		return "", nil
	}
	if e != nil {
		return "", e
	}
	in := windows.DataBlob{Size: uint32(len(b)), Data: &b[0]}
	var out windows.DataBlob
	if e = windows.CryptUnprotectData(&in, nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); e != nil {
		log.Printf("jev key: %v", e)
		return "", nil
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	return string(unsafe.Slice(out.Data, out.Size)), nil
}

func (k dpapiKeyStore) Clear() error {
	if e := os.Remove(k.path); e != nil && !errors.Is(e, os.ErrNotExist) {
		return e
	}
	return nil
}
```

`jevkey_other.go`:

```go
//go:build !windows

package main

import "errors"

type unsupportedKeyStore struct{}

func newKeyStore(string) keyStore { return unsupportedKeyStore{} }

func (unsupportedKeyStore) Supported() bool        { return false }
func (unsupportedKeyStore) Load() (string, error)  { return "", nil }
func (unsupportedKeyStore) Save(string) error      { return errors.New("この環境では使えません") }
func (unsupportedKeyStore) Clear() error           { return nil }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `go test -run "DPAPI|BackupExcludesJevKey" . && GOOS=linux go vet .`
Expected: `ok  memotodo`。Linux 向け vet もエラーなし（`jevkey_other.go` がコンパイルできることの確認。Linux 向けで既存のファイルに別のエラーが出る場合は、`GOOS=linux go build -tags server .` で代替し、出たエラーが既存のものであることを報告に書く）

- [ ] **Step 5: コミット**

```bash
git add jevkey.go jevkey_windows.go jevkey_other.go jevkey_windows_test.go
git commit -m "Store the Jev API key with DPAPI outside backups"
```

---

### Task 4: 設定項目と `App` のメソッド

**Files:**
- Create: `smart_add.go`
- Test: `smart_add_test.go`
- Modify: `internal/board/models.go`（`Settings` に `SmartAdd`）
- Modify: `app.go`（`App` 構造体にフィールド、`SetQuickAddLayout` に `rows`）
- Modify: `main.go`（`service.jevKeys = newKeyStore(dir)`）

**Interfaces:**
- Consumes: Task 1 の `jev.New`・`jev.ErrUnauthorized`・`jev.ErrTooLarge`・`jev.Question`・`jev.Answer`、Task 2 の `smartadd.Build`・`smartadd.Decide`・`smartadd.Suggestion`・`smartadd.State`・`smartadd.MaxOpenTasks`、Task 3 の `keyStore`・`newKeyStore`
- Produces（Wails からは `main.App.<名前>` で呼ばれる）:
  - `board.Settings.SmartAdd bool` — JSON は `smart_add`
  - `type JevStatus struct { Supported bool \`json:"supported"\`; Configured bool \`json:"configured"\`; Hint string \`json:"hint"\`; Invalid bool \`json:"invalid"\` }`
  - `func (a *App) SuggestQuickAdd(title string, generation uint64) (smartadd.Suggestion, error)`
  - `func (a *App) GetJevStatus() JevStatus`
  - `func (a *App) SetJevKey(key string) error` — 前後の空白を除く。空ならエラー「APIキーを入力してください」。成功後に `board:jev` を送る
  - `func (a *App) ClearJevKey() error` — 成功後に `board:jev` を送る
  - `func (a *App) TestJevKey() (string, error)` — `"ok" | "invalid" | "unreachable"`。キーが無ければエラー「APIキーが未設定です」
  - `func (a *App) SetQuickAddLayout(expanded, options bool, rows int, generation uint64)` — 引数 `rows` を追加
  - `func quickAddHeight(options bool, rows int) int` — `options` なら430、そうでなければ `105 + clamp(rows,0,3)*26`

- [ ] **Step 1: 失敗するテストを書く**

`smart_add_test.go`:

```go
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

func (m *memKeys) Supported() bool         { return m.supported }
func (m *memKeys) Load() (string, error)   { return m.key, nil }
func (m *memKeys) Save(key string) error   { m.key = key; return nil }
func (m *memKeys) Clear() error            { m.key = ""; return nil }

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
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `go test -run "Suggest|Jev|Snapshot|QuickAddHeight" .`
Expected: FAIL（`unknown field jevKeys`・`undefined: quickAddHeight` などのコンパイルエラー）

- [ ] **Step 3: 実装する**

`internal/board/models.go` の `Settings` の末尾（`Monitor` の次の行）に追加:

```go
	SmartAdd            bool          `json:"smart_add"`
```

`app.go` の `App` 構造体の末尾（`quitting atomic.Bool` の次）に追加:

```go
	jevKeys              keyStore
	newJev               func(key string) jevAPI
	jevInvalid           atomic.Bool
```

`app.go` の `SetQuickAddExpanded` と `SetQuickAddLayout` を置き換える:

```go
func (a *App) SetQuickAddExpanded(expanded bool) {
	a.SetQuickAddLayout(expanded, false, 0, a.quickGeneration.Load())
}
func quickAddHeight(options bool, rows int) int {
	if options {
		return 430
	}
	return 105 + min(max(rows, 0), 3)*26
}
func (a *App) SetQuickAddLayout(expanded, options bool, rows int, generation uint64) {
	application.InvokeSync(func() {
		if generation != a.quickGeneration.Load() {
			return
		}
		if a.mini == nil {
			return
		}
		height := quickAddHeight(options, rows)
		_ = expanded // Suggestions never resize the input window.
		currentWidth, currentHeight := a.mini.Size()
		if currentWidth == 360 && currentHeight == height {
			return
		}
		a.hideQuickSuggestionWindow()
		a.mini.SetSize(360, height)
		if a.quickCursor.Load() {
			a.placeQuickAtCursor(false)
		} else if a.tray != nil {
			a.tray.PositionWindow(a.mini, 8)
			a.clampQuickToWorkArea()
		}
		a.refreshQuickSuggestions()
	})
}
```

`main.go` の `service := &App{...}` の次の行に追加:

```go
	service.jevKeys = newKeyStore(dir)
```

`smart_add.go`:

```go
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
```

注: `TestSuggestQuickAddHalvesTasksOnceWhenTooLarge` は、1回目に4件を送り、2回目に `max(4/2,1)=2` 件を送ることを確認する。`board.Open` が既定のカテゴリを作るので、`SaveTask` はカテゴリ指定なしで通る。

- [ ] **Step 4: テストが通ることを確認する**

Run: `go test ./... && go vet ./...`
Expected: 全パッケージ `ok`、vet の出力なし

- [ ] **Step 5: コミット**

```bash
git add internal/board/models.go app.go main.go smart_add.go smart_add_test.go
git commit -m "Expose Jev smart quick add and key management to the frontend"
```

---

### Task 5: フロントの反映ロジック（`smartAdd.ts`）

**Files:**
- Create: `frontend/src/smartAdd.ts`
- Test: `frontend/src/smartAdd.test.ts`
- Modify: `frontend/src/types.ts`（`Settings` に `smart_add?: boolean`）

**Interfaces:**
- Consumes: 既存の `presetTime(kind, time, now)`（`reminderPresets.ts`）、`date(d)`（`types.ts`）、Task 4 の `Suggestion`・`JevStatus` の JSON 形
- Produces:
  - `type Suggestion = { category_id: number; important: boolean; deadline: string; reminder: string; duplicate: { task_id: number; title: string } | null; invalid: boolean }`
  - `type JevStatus = { supported: boolean; configured: boolean; hint: string; invalid: boolean }`
  - `type Field = "category" | "important" | "deadline" | "reminder"`
  - `type QuickOptions = { deadline: string; reminder_at: string; reminder_mode: string; reminder_time: string; important: boolean; category_id: number }`
  - `type AutoFields = Partial<Record<Field, string>>` — 自動で入れた欄と、その種類（`deadline` なら `"tomorrow"` など）
  - `blankOptions(): QuickOptions`
  - `deadlineDate(kind: string, now?: Date): string` — `YYYY-MM-DD` か `""`
  - `applySuggestion(options, touched: ReadonlySet<Field>, auto, s: Suggestion | null, defaultTime?, now?): { options; auto }`
  - `dropChip(options, auto, field): { options; auto }`
  - `chipLabels(auto, options, categories: { id: number; name: string }[]): { field: Field; label: string }[]`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/smartAdd.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  blankOptions,
  chipLabels,
  deadlineDate,
  dropChip,
  Field,
  Suggestion,
} from "./smartAdd";
const none: Suggestion = {
  category_id: 0,
  important: false,
  deadline: "",
  reminder: "",
  duplicate: null,
  invalid: false,
};
// 2026-10-05 is a Monday.
const at = (d: number, h = 10) => new Date(2026, 9, d, h, 0, 0);
describe("deadlineDate", () => {
  it.each([
    ["today", 5, "2026-10-05"],
    ["tomorrow", 5, "2026-10-06"],
    ["this_week", 5, "2026-10-09"],
    ["this_week", 9, "2026-10-09"],
    ["this_week", 10, "2026-10-11"],
    ["this_week", 11, "2026-10-11"],
    ["next_week", 5, "2026-10-16"],
    ["next_week", 11, "2026-10-16"],
    ["none", 5, ""],
    ["toString", 5, ""],
  ])("%s on day %i", (kind, day, want) => {
    expect(deadlineDate(kind as string, at(day as number))).toBe(want);
  });
});
describe("applySuggestion", () => {
  const full: Suggestion = {
    ...none,
    category_id: 2,
    important: true,
    deadline: "tomorrow",
    reminder: "1h",
  };
  it("fills untouched fields and records them as automatic", () => {
    const r = applySuggestion(blankOptions(), new Set(), {}, full, "09:00", at(5));
    expect(r.options).toEqual({
      category_id: 2,
      important: true,
      deadline: "2026-10-06",
      reminder_at: "2026-10-05T11:00:00",
      reminder_mode: "",
      reminder_time: "",
    });
    expect(r.auto).toEqual({
      category: "2",
      important: "1",
      deadline: "tomorrow",
      reminder: "1h",
    });
  });
  it("never overwrites touched fields", () => {
    const touched = new Set<Field>(["important", "deadline"]);
    const start = { ...blankOptions(), deadline: "2026-12-24" };
    const r = applySuggestion(start, touched, {}, full, "09:00", at(5));
    expect(r.options.important).toBe(false);
    expect(r.options.deadline).toBe("2026-12-24");
    expect(r.auto.important).toBeUndefined();
    expect(r.auto.deadline).toBeUndefined();
    expect(r.options.category_id).toBe(2);
  });
  it("clears automatic values the new suggestion no longer has, but keeps manual ones", () => {
    const first = applySuggestion(blankOptions(), new Set(), {}, full, "09:00", at(5));
    const manual = { ...first.options, important: true };
    const r = applySuggestion(manual, new Set<Field>(["important"]), first.auto, none, "09:00", at(5));
    expect(r.options).toEqual({ ...blankOptions(), important: true });
    expect(r.auto).toEqual({});
  });
  it("clears everything automatic when the title is emptied", () => {
    const first = applySuggestion(blankOptions(), new Set(), {}, full, "09:00", at(5));
    expect(applySuggestion(first.options, new Set(), first.auto, null).options).toEqual(blankOptions());
  });
  it("uses the deadline reminder only when a deadline exists", () => {
    const s = { ...none, deadline: "today", reminder: "deadline" };
    const r = applySuggestion(blankOptions(), new Set(), {}, s, "08:30", at(5));
    expect(r.options).toMatchObject({
      deadline: "2026-10-05",
      reminder_mode: "deadline",
      reminder_time: "08:30",
      reminder_at: "",
    });
    const orphan = applySuggestion(blankOptions(), new Set(), {}, { ...none, reminder: "deadline" }, "08:30", at(5));
    expect(orphan.options.reminder_mode).toBe("");
    expect(orphan.auto.reminder).toBeUndefined();
  });
  it("drops a stale deadline reminder when the deadline goes away", () => {
    const start = { ...blankOptions(), reminder_mode: "deadline", reminder_time: "09:00" };
    const r = applySuggestion(start, new Set<Field>(["reminder"]), { deadline: "today" }, none);
    expect(r.options.reminder_mode).toBe("");
  });
});
describe("dropChip", () => {
  it("removes a deadline together with its deadline reminder", () => {
    const s = { ...none, deadline: "today", reminder: "deadline" };
    const first = applySuggestion(blankOptions(), new Set(), {}, s, "09:00", at(5));
    const r = dropChip(first.options, first.auto, "deadline");
    expect(r.options).toEqual(blankOptions());
    expect(r.auto).toEqual({});
  });
  it("removes only the chosen field", () => {
    const r = dropChip(
      { ...blankOptions(), category_id: 3, important: true },
      { category: "3", important: "1" },
      "category",
    );
    expect(r.options).toEqual({ ...blankOptions(), important: true });
    expect(r.auto).toEqual({ important: "1" });
  });
});
describe("chipLabels", () => {
  it("labels automatic fields in a fixed order", () => {
    const options = {
      ...blankOptions(),
      category_id: 2,
      important: true,
      deadline: "2026-10-06",
      reminder_at: "2026-10-06T09:00:00",
    };
    const labels = chipLabels(
      { reminder: "tomorrow", deadline: "tomorrow", important: "1", category: "2" },
      options,
      [{ id: 2, name: "経理" }],
    );
    expect(labels.map((l) => l.label)).toEqual(["経理", "重要", "期限 明日", "通知 10/6 09:00"]);
    expect(chipLabels({ category: "9" }, { ...options, category_id: 9 }, [])).toEqual([]);
    expect(chipLabels({ reminder: "deadline" }, options, [])[0].label).toBe("期限日に通知");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && npx vitest run src/smartAdd.test.ts`
Expected: FAIL（`Failed to resolve import "./smartAdd"`）

- [ ] **Step 3: 実装する**

`frontend/src/types.ts` の `Settings` 型の `monitor: string;` の次に追加:

```ts
  smart_add?: boolean;
```

`frontend/src/smartAdd.ts`:

```ts
import { presetTime } from "./reminderPresets";
import { date } from "./types";
export type Suggestion = {
  category_id: number;
  important: boolean;
  deadline: string;
  reminder: string;
  duplicate: { task_id: number; title: string } | null;
  invalid: boolean;
};
export type JevStatus = {
  supported: boolean;
  configured: boolean;
  hint: string;
  invalid: boolean;
};
export type Field = "category" | "important" | "deadline" | "reminder";
export type QuickOptions = {
  deadline: string;
  reminder_at: string;
  reminder_mode: string;
  reminder_time: string;
  important: boolean;
  category_id: number;
};
export type AutoFields = Partial<Record<Field, string>>;
export const blankOptions = (): QuickOptions => ({
  deadline: "",
  reminder_at: "",
  reminder_mode: "",
  reminder_time: "",
  important: false,
  category_id: 0,
});
const noReminder = { reminder_at: "", reminder_mode: "", reminder_time: "" };
// Weeks run Monday to Sunday; "this week" means Friday, or Sunday once Friday has passed.
export function deadlineDate(kind: string, now = new Date()): string {
  const day = now.getDay() || 7;
  const offsets: Record<string, number> = {
    today: 0,
    tomorrow: 1,
    this_week: day <= 5 ? 5 - day : 7 - day,
    next_week: 12 - day,
  };
  if (!Object.prototype.hasOwnProperty.call(offsets, kind)) return "";
  const d = new Date(now);
  d.setDate(d.getDate() + offsets[kind]);
  return date(d);
}
export function applySuggestion(
  options: QuickOptions,
  touched: ReadonlySet<Field>,
  auto: AutoFields,
  s: Suggestion | null,
  defaultTime = "09:00",
  now = new Date(),
): { options: QuickOptions; auto: AutoFields } {
  const next = { ...options };
  const nextAuto: AutoFields = {};
  const apply = (
    field: Field,
    value: string | undefined,
    write: () => void,
    clear: () => void,
  ) => {
    if (touched.has(field)) return;
    if (value) {
      write();
      nextAuto[field] = value;
    } else if (auto[field] !== undefined) clear();
  };
  apply(
    "category",
    s && s.category_id > 0 ? String(s.category_id) : undefined,
    () => (next.category_id = s!.category_id),
    () => (next.category_id = 0),
  );
  apply(
    "important",
    s?.important ? "1" : undefined,
    () => (next.important = true),
    () => (next.important = false),
  );
  const due = s ? deadlineDate(s.deadline, now) : "";
  apply(
    "deadline",
    due ? s!.deadline : undefined,
    () => (next.deadline = due),
    () => (next.deadline = ""),
  );
  const reminder =
    s?.reminder && (s.reminder !== "deadline" || next.deadline)
      ? s.reminder
      : undefined;
  apply(
    "reminder",
    reminder,
    () =>
      Object.assign(
        next,
        reminder === "deadline"
          ? { reminder_mode: "deadline", reminder_time: defaultTime, reminder_at: "" }
          : { ...noReminder, reminder_at: presetTime(reminder!, defaultTime, now) },
      ),
    () => Object.assign(next, noReminder),
  );
  if (!next.deadline && next.reminder_mode === "deadline") {
    Object.assign(next, noReminder);
    delete nextAuto.reminder;
  }
  return { options: next, auto: nextAuto };
}
export function dropChip(
  options: QuickOptions,
  auto: AutoFields,
  field: Field,
): { options: QuickOptions; auto: AutoFields } {
  const next = { ...options };
  const nextAuto = { ...auto };
  delete nextAuto[field];
  if (field === "category") next.category_id = 0;
  if (field === "important") next.important = false;
  if (field === "reminder") Object.assign(next, noReminder);
  if (field === "deadline") {
    next.deadline = "";
    if (next.reminder_mode === "deadline") {
      Object.assign(next, noReminder);
      delete nextAuto.reminder;
    }
  }
  return { options: next, auto: nextAuto };
}
const deadlineNames: Record<string, string> = {
  today: "今日",
  tomorrow: "明日",
  this_week: "今週中",
  next_week: "来週",
};
const shortTime = (iso: string) =>
  `${+iso.slice(5, 7)}/${+iso.slice(8, 10)} ${iso.slice(11, 16)}`;
export function chipLabels(
  auto: AutoFields,
  options: QuickOptions,
  categories: { id: number; name: string }[],
): { field: Field; label: string }[] {
  const out: { field: Field; label: string }[] = [];
  const category = categories.find((c) => c.id === options.category_id);
  if (auto.category && category) out.push({ field: "category", label: category.name });
  if (auto.important) out.push({ field: "important", label: "重要" });
  if (auto.deadline)
    out.push({ field: "deadline", label: "期限 " + (deadlineNames[auto.deadline] ?? "") });
  if (auto.reminder)
    out.push({
      field: "reminder",
      label:
        auto.reminder === "deadline"
          ? "期限日に通知"
          : "通知 " + shortTime(options.reminder_at),
    });
  return out;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd frontend && npx vitest run src/smartAdd.test.ts && npx tsc --noEmit -p .`
Expected: 全テスト PASS、型エラーなし。`deadlineDate` のテストは実行環境のタイムゾーンに依存しない（ローカル時刻で作って `date()` でローカル日付を取るため）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/smartAdd.ts frontend/src/smartAdd.test.ts frontend/src/types.ts
git commit -m "Add quick-add suggestion merging and chip labels"
```

---

### Task 6: クイック追加画面への組み込み

**Files:**
- Modify: `frontend/src/QuickAdd.tsx`（全体を下記に置き換える）
- Modify: `frontend/src/styles/todo.css`（末尾に追記）
- Test: `frontend/src/quickAdd.test.tsx`（テストを追加）

**Interfaces:**
- Consumes: Task 4 の `SuggestQuickAdd(title, generation)`・`GetJevStatus()`・`SetQuickAddLayout(expanded, options, rows, generation)`・イベント `board:jev`、Task 5 の `applySuggestion`・`dropChip`・`chipLabels`・`blankOptions`・型
- Produces: 画面上のラベル（テストと手動確認で使う）
  - チップ行: `aria-label="推定した初期値"`、各チップの ✕ は `aria-label="<ラベル>を外す"`
  - 重複の警告: ボタン、文言 `⚠ 似たタスクがあります: <タイトル> ›`
  - キー無効: `role="status"`、文言 `Jevのキーが無効です（設定で確認）`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/quickAdd.test.tsx` の `@testing-library/react` の import に `within` を足し、末尾に追加する:

```tsx
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function smartMock(
  suggest: (title: string) => unknown | Promise<unknown>,
  extra: Partial<Record<string, unknown>> = {},
) {
  vi.mocked(api).mockImplementation(async (method, ...args) => {
    if (method === "GetSnapshot")
      return {
        tasks: [],
        categories: [
          { id: 1, name: "未分類", color: "", sort_order: 0 },
          { id: 2, name: "経理", color: "", sort_order: 1 },
        ],
        settings: { suggest_min_count: 3, smart_add: true, reminder_default_time: "09:00" },
        ...extra,
      };
    if (method === "GetJevStatus")
      return { supported: true, configured: true, hint: "", invalid: false };
    if (method === "SetQuickSuggestions") return false;
    if (method === "SuggestQuickAdd") return suggest(args[0] as string);
    return undefined;
  });
}
const result = (p: object) => ({
  category_id: 0,
  important: false,
  deadline: "",
  reminder: "",
  duplicate: null,
  invalid: false,
  ...p,
});
const calls = (m: string) => vi.mocked(api).mock.calls.filter((c) => c[0] === m);
it("asks Jev 0.4s after typing stops and shows chips and a duplicate warning", async () => {
  smartMock(() => result({ category_id: 2, important: true, duplicate: { task_id: 7, title: "請求書提出" } }));
  render(<QuickAdd />);
  const input = screen.getByLabelText("トレイからタスク追加");
  await act(async () => {});
  fireEvent.change(input, { target: { value: "請求書を経理に" } });
  expect(calls("SuggestQuickAdd")).toHaveLength(0);
  await waitFor(() => screen.getByLabelText("推定した初期値"), { timeout: 1500 });
  expect(calls("SuggestQuickAdd")[0].slice(1)).toEqual(["請求書を経理に", 0]);
  expect(screen.getByText("経理")).toBeTruthy();
  expect(screen.getByText("重要")).toBeTruthy();
  fireEvent.click(screen.getByText(/似たタスクがあります: 請求書提出/));
  await waitFor(() => expect(calls("OpenTask")[0][1]).toBe(7));
  await waitFor(() =>
    expect(calls("SetQuickAddLayout").at(-1)!.slice(1)).toEqual([false, false, 2, 0]),
  );
  fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  await waitFor(() => expect(calls("SaveTask")).toHaveLength(1));
  expect(calls("SaveTask")[0][1]).toMatchObject({ title: "請求書を経理に", category_id: 2, important: true });
});
it("does not ask while composing and asks after composition ends", async () => {
  smartMock(() => result({}));
  render(<QuickAdd />);
  const input = screen.getByLabelText("トレイからタスク追加");
  await act(async () => {});
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "せいきゅう" } });
  await act(() => sleep(600));
  expect(calls("SuggestQuickAdd")).toHaveLength(0);
  fireEvent.compositionEnd(input);
  await waitFor(() => expect(calls("SuggestQuickAdd")).toHaveLength(1), { timeout: 1500 });
});
it("ignores stale answers and does not wait for Jev on Enter", async () => {
  const pending: ((v: unknown) => void)[] = [];
  smartMock(() => new Promise((resolve) => pending.push(resolve)));
  render(<QuickAdd />);
  const input = screen.getByLabelText("トレイからタスク追加");
  await act(async () => {});
  fireEvent.change(input, { target: { value: "一つ目" } });
  await waitFor(() => expect(pending).toHaveLength(1), { timeout: 1500 });
  fireEvent.change(input, { target: { value: "二つ目" } });
  await waitFor(() => expect(pending).toHaveLength(2), { timeout: 1500 });
  await act(async () => pending[0](result({ important: true })));
  expect(screen.queryByLabelText("推定した初期値")).toBeNull();
  fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  await waitFor(() => expect(calls("SaveTask")).toHaveLength(1));
  expect(calls("SaveTask")[0][1]).toMatchObject({ title: "二つ目", important: false });
  await act(async () => pending[1](result({ important: true })));
  expect(screen.queryByLabelText("推定した初期値")).toBeNull();
});
it("keeps a field the user changed and lets a chip be removed", async () => {
  smartMock((title) => result({ important: true, category_id: title.includes("経理") ? 2 : 0 }));
  render(<QuickAdd />);
  const input = screen.getByLabelText("トレイからタスク追加");
  await act(async () => {});
  fireEvent.click(screen.getByLabelText("登録時の期限・通知"));
  fireEvent.click(screen.getByLabelText("重要"));
  fireEvent.click(screen.getByLabelText("重要"));
  fireEvent.change(input, { target: { value: "経理に連絡" } });
  await waitFor(() => screen.getByText("経理"), { timeout: 1500 });
  expect(within(screen.getByLabelText("推定した初期値")).queryByText(/重要/)).toBeNull();
  expect((screen.getByLabelText("重要") as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByLabelText("経理を外す"));
  expect(screen.queryByLabelText("推定した初期値")).toBeNull();
  fireEvent.change(input, { target: { value: "経理に電話" } });
  await act(() => sleep(700));
  expect(screen.queryByLabelText("推定した初期値")).toBeNull();
});
it("saves into the default category when the suggested one was deleted meanwhile", async () => {
  smartMock(() => result({ category_id: 2 }));
  render(<QuickAdd />);
  const input = screen.getByLabelText("トレイからタスク追加");
  await act(async () => {});
  fireEvent.change(input, { target: { value: "経理に連絡" } });
  await waitFor(() => screen.getByText("経理"), { timeout: 1500 });
  const original = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation(async (method, ...args) =>
    method === "GetSnapshot"
      ? { tasks: [], categories: [{ id: 1, name: "未分類", color: "", sort_order: 0 }], settings: { smart_add: true } }
      : original(method, ...args),
  );
  await act(async () => listeners.get("board:changed")?.(undefined));
  fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  await waitFor(() => expect(calls("SaveTask")).toHaveLength(1));
  expect(calls("SaveTask")[0][1]).toMatchObject({ category_id: 0 });
});
it("shows an invalid-key notice once and stops asking", async () => {
  smartMock(() => result({ invalid: true }));
  render(<QuickAdd />);
  const input = screen.getByLabelText("トレイからタスク追加");
  await act(async () => {});
  fireEvent.change(input, { target: { value: "一つ目" } });
  await waitFor(() => screen.getByText("Jevのキーが無効です（設定で確認）"), { timeout: 1500 });
  fireEvent.change(input, { target: { value: "二つ目" } });
  await act(() => sleep(700));
  expect(calls("SuggestQuickAdd")).toHaveLength(1);
});
it("never asks Jev when smart add is off or no key is set", async () => {
  smartMock(() => result({ important: true }), { settings: { smart_add: false } });
  render(<QuickAdd />);
  const input = screen.getByLabelText("トレイからタスク追加");
  await act(async () => {});
  fireEvent.change(input, { target: { value: "何かの用事" } });
  await act(() => sleep(700));
  expect(calls("SuggestQuickAdd")).toHaveLength(0);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && npx vitest run src/quickAdd.test.tsx`
Expected: 追加したテストが FAIL（`推定した初期値` が見つからない・`SuggestQuickAdd` が呼ばれない）。既存の2件は PASS のまま

- [ ] **Step 3: 実装する**

`frontend/src/QuickAdd.tsx` を次の内容で置き換える（既存の挙動はそのまま、★ の付いたところが追加・変更）:

```tsx
import { useEffect, useRef, useState } from "react";
import { api, on } from "./api";
import { emptyTask, Snapshot } from "./types";
import { useSuggestions } from "./Suggestions";
import { ReminderFields } from "./ReminderFields";
import { Icon } from "./Icons";
import { useTheme } from "./theme";
import {
  applySuggestion,
  AutoFields,
  blankOptions,
  chipLabels,
  dropChip,
  Field,
  JevStatus,
  QuickOptions,
  Suggestion,
} from "./smartAdd";
export function QuickAdd() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false),
    [options, setOptions] = useState<QuickOptions>(blankOptions);
  const [nativeSuggestions, setNativeSuggestions] = useState(true),
    [showCounter, setShowCounter] = useState(0),
    [generation, setGeneration] = useState(0);
  const operation = useRef(0),
    generationRef = useRef(0);
  const anchor = useRef<HTMLDivElement>(null),
    revision = useRef(0),
    input = useRef<HTMLInputElement>(null),
    addLock = useRef(false);
  // ★ Smart add state. Automatic values never overwrite fields the user touched.
  const [jevStatus, setJevStatus] = useState<JevStatus | null>(null),
    [auto, setAuto] = useState<AutoFields>({}),
    [duplicate, setDuplicate] = useState<Suggestion["duplicate"]>(null),
    [jevInvalid, setJevInvalid] = useState(false),
    [composeTick, setComposeTick] = useState(0);
  const touched = useRef(new Set<Field>()),
    autoRef = useRef<AutoFields>({}),
    optionsRef = useRef(options),
    composing = useRef(false),
    lastAsked = useRef(""),
    smartSeq = useRef(0);
  optionsRef.current = options;
  useEffect(() => {
    localStorage.removeItem("tray-quick-draft");
    localStorage.removeItem("tray-quick-options");
  }, []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const suggest = useSuggestions(
    snapshot?.tasks ?? [],
    text,
    snapshot?.settings.suggest_min_count ?? 3,
    setText,
  );
  const defaultTime = snapshot?.settings.reminder_default_time || "09:00";
  const smartEnabled = !!snapshot?.settings.smart_add && !!jevStatus?.configured;
  const chips = chipLabels(auto, options, snapshot?.categories ?? []);
  const rows = (chips.length ? 1 : 0) + (duplicate ? 1 : 0) + (jevInvalid ? 1 : 0);
  const commitSmart = (next: { options: QuickOptions; auto: AutoFields }) => {
    autoRef.current = next.auto;
    optionsRef.current = next.options;
    setAuto(next.auto);
    setOptions(next.options);
  };
  const resetSmart = () => {
    smartSeq.current++;
    touched.current = new Set();
    lastAsked.current = "";
    autoRef.current = {};
    setAuto({});
    setDuplicate(null);
  };
  const touch = (field: Field) => {
    touched.current.add(field);
    if (autoRef.current[field] === undefined) return;
    const next = { ...autoRef.current };
    delete next[field];
    autoRef.current = next;
    setAuto(next);
  };
  useEffect(() => {
    void api("SetQuickAddLayout", false, optionsOpen, rows, generation).catch(
      (e) => setError(String(e)),
    );
  }, [optionsOpen, generation, rows]);
  useEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    void api<boolean>("SetQuickSuggestions", {
      items: suggest.items,
      index: suggest.index,
      revision: ++revision.current,
      generation,
      anchor: {
        X: Math.round(r.x),
        Y: Math.round(r.y),
        Width: Math.round(r.width),
        Height: Math.round(r.height),
      },
    })
      .then(setNativeSuggestions)
      .catch((e) => setError(String(e)));
  }, [
    JSON.stringify(suggest.items),
    suggest.index,
    optionsOpen,
    showCounter,
    generation,
  ]);
  // ★ Ask Jev once typing settles; stale answers are dropped by sequence, input session and window generation.
  useEffect(() => {
    const title = text.trim();
    if (!title) {
      lastAsked.current = "";
      if (Object.keys(autoRef.current).length)
        commitSmart(
          applySuggestion(optionsRef.current, touched.current, autoRef.current, null, defaultTime),
        );
      setDuplicate(null);
      return;
    }
    if (!smartEnabled || jevInvalid || title.length < 2 || title === lastAsked.current)
      return;
    const timer = setTimeout(() => {
      if (composing.current) return;
      lastAsked.current = title;
      const seq = ++smartSeq.current,
        token = operation.current,
        gen = generationRef.current;
      void api<Suggestion>("SuggestQuickAdd", title, gen)
        .then((s) => {
          if (
            !s ||
            seq !== smartSeq.current ||
            token !== operation.current ||
            gen !== generationRef.current
          )
            return;
          if (s.invalid) {
            setJevInvalid(true);
            return;
          }
          commitSmart(
            applySuggestion(optionsRef.current, touched.current, autoRef.current, s, defaultTime),
          );
          setDuplicate(s.duplicate);
        })
        .catch(() => {
          if (seq === smartSeq.current) lastAsked.current = "";
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [text, smartEnabled, jevInvalid, composeTick]);
  useTheme(snapshot?.settings.theme);
  const discard = () => {
    operation.current++;
    setText("");
    setOptions(blankOptions());
    resetSmart();
    setOptionsOpen(false);
    setError("");
    suggest.blur();
  };
  const cancel = () => {
    discard();
    void api("HideQuickAdd").catch((e) => setError(String(e)));
  };
  useEffect(() => {
    const reload = () => {
      void api<Snapshot>("GetSnapshot")
        .then(setSnapshot)
        .catch((e) => setError(String(e)));
      void api<JevStatus>("GetJevStatus")
        .then((s) => setJevStatus(s ?? null))
        .catch(() => setJevStatus(null));
    };
    const focus = (value?: unknown) => {
      if (typeof value === "number") {
        if (value < generationRef.current) return;
        if (value !== generationRef.current) setJevInvalid(false);
        generationRef.current = value;
        setGeneration(value);
      }
      input.current?.focus();
      suggest.focus();
      setShowCounter((n) => n + 1);
    };
    reload();
    const off = [
      on("board:mini-focus", focus),
      on("board:changed", reload),
      on("board:jev", reload),
      on("board:mini-reset", (value) => {
        if (typeof value === "number") {
          if (value < generationRef.current) return;
          generationRef.current = value;
          setGeneration(value);
        }
        discard();
      }),
      on("board:mini-choice", (value) => {
        const choice = value as { title: string; generation: number };
        if (choice.generation !== generationRef.current) return;
        suggest.choose(choice.title);
        requestAnimationFrame(() => input.current?.focus());
      }),
    ];
    const focusWindow = () => {
      if (
        document.activeElement === document.body ||
        document.activeElement === input.current
      )
        focus();
    };
    const resized = () => setShowCounter((n) => n + 1);
    window.addEventListener("resize", resized);
    window.addEventListener("focus", focusWindow);
    return () => {
      off.forEach((f) => f());
      window.removeEventListener("resize", resized);
      window.removeEventListener("focus", focusWindow);
    };
  }, []);
  const add = async () => {
    if (addLock.current || !text.trim()) return;
    addLock.current = true;
    const token = operation.current;
    setBusy(true);
    setError("");
    // ★ A suggested category may have been deleted since; fall back to the default.
    const category_id = snapshot?.categories?.some((c) => c.id === options.category_id)
      ? options.category_id
      : 0;
    try {
      await api("SaveTask", { ...emptyTask(), title: text, ...options, category_id });
      if (token !== operation.current) return;
      setOptions(blankOptions());
      resetSmart();
      setOptionsOpen(false);
      setText("");
      suggest.reset();
    } catch (e) {
      if (token === operation.current) setError(String(e));
    } finally {
      setBusy(false);
      addLock.current = false;
      requestAnimationFrame(() => {
        if (token === operation.current && document.hasFocus())
          input.current?.focus();
      });
    }
  };
  return (
    <main
      className="mini-add"
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          !e.nativeEvent.isComposing &&
          e.keyCode !== 229
        ) {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <header>
        <strong>タスクを追加</strong>
        <button aria-label="入力欄を閉じる" onClick={cancel}>
          ×
        </button>
      </header>
      <div className="mini-input" ref={anchor}>
        <input
          ref={input}
          aria-label="トレイからタスク追加"
          placeholder="入力してEnterで追加"
          value={text}
          readOnly={busy}
          onCompositionStart={() => {
            composing.current = true;
            suggest.compositionStart();
          }}
          onCompositionUpdate={suggest.compositionUpdate}
          onCompositionEnd={() => {
            composing.current = false;
            suggest.compositionEnd();
            setComposeTick((n) => n + 1);
          }}
          onKeyUp={suggest.keyUp}
          onFocus={suggest.focus}
          onBlur={suggest.blur}
          onChange={(e) => {
            setText(e.target.value);
            suggest.reset();
          }}
          onKeyDown={(e) => {
            if (busy) return;
            if (e.key === "Escape") return;
            if (suggest.keyDown(e)) return;
            if (
              e.key === "Enter" &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              void add();
            }
          }}
        />
        <button
          className="mini-clock"
          aria-label="登録時の期限・通知"
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen(!optionsOpen)}
        >
          <Icon name="clock" />
        </button>
      </div>
      {!nativeSuggestions && suggest.list}
      {chips.length > 0 && (
        <div className="smart-chips" aria-label="推定した初期値">
          {chips.map((c) => (
            <span key={c.field} className="smart-chip">
              {c.label}
              <button
                aria-label={`${c.label}を外す`}
                onClick={() => {
                  touched.current.add(c.field);
                  commitSmart(dropChip(optionsRef.current, autoRef.current, c.field));
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {duplicate && (
        <button
          className="smart-duplicate"
          onClick={() =>
            void api("OpenTask", duplicate.task_id).catch((e) => setError(String(e)))
          }
        >
          ⚠ 似たタスクがあります: {duplicate.title} ›
        </button>
      )}
      {jevInvalid && (
        <p className="smart-invalid" role="status">
          Jevのキーが無効です（設定で確認）
        </p>
      )}
      {optionsOpen && (
        <div className="mini-options">
          <ReminderFields
            value={options}
            defaultTime={snapshot?.settings.reminder_default_time}
            onChange={(p) => {
              if ("deadline" in p) touch("deadline");
              if ("reminder_at" in p || "reminder_mode" in p) touch("reminder");
              setOptions((v) => ({ ...v, ...p }));
            }}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={options.important}
              onChange={(e) => {
                touch("important");
                setOptions({ ...options, important: e.target.checked });
              }}
            />
            重要
          </label>
          <div className="mini-actions">
            <button
              disabled={busy}
              data-tip="入力中の内容を消去"
              aria-label="入力中の内容を削除"
              onClick={() => {
                setText("");
                setOptions(blankOptions());
                resetSmart();
                setError("");
                suggest.reset();
                input.current?.focus();
              }}
            >
              <Icon name="trash" />
            </button>
            <button
              className="primary"
              disabled={busy || !text.trim()}
              onClick={() => void add()}
            >
              登録
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

`frontend/src/styles/todo.css` の末尾に追記:

```css
/* Smart add: chips and notices sit under the input; the window grows by one row each. */
.smart-chips { display: flex; gap: 4px; margin-top: 5px; overflow: hidden; }
.smart-chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 2px 1px 7px; border: 1px solid var(--border); border-radius: 10px; font-size: 11px; white-space: nowrap; }
.smart-chip button { border: 0; background: transparent; padding: 0 4px; font-size: 11px; line-height: 1; }
.smart-duplicate { display: block; width: 100%; margin-top: 4px; padding: 2px 4px; border: 0; background: transparent; color: var(--text); text-align: left; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.smart-duplicate:hover { background: var(--hover); }
.mini-add .smart-chips, .mini-add .smart-duplicate { --wails-draggable: no-drag; }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd frontend && npx vitest run && npx tsc --noEmit -p . && npx prettier --check src`
Expected: 全テスト PASS（既存の behavior.test.tsx なども含む）、型エラーなし。prettier の差分があれば `npx prettier --write src/QuickAdd.tsx src/quickAdd.test.tsx src/smartAdd.ts src/smartAdd.test.ts` で整形してから再実行

- [ ] **Step 5: コミット**

```bash
git add frontend/src/QuickAdd.tsx frontend/src/quickAdd.test.tsx frontend/src/styles/todo.css
git commit -m "Fill quick-add defaults from Jev and warn about similar tasks"
```

---

### Task 7: 設定画面と README

**Files:**
- Create: `frontend/src/JevKeyField.tsx`
- Test: `frontend/src/jevKeyField.test.tsx`
- Modify: `frontend/src/SettingsForm.tsx`（「アプリ」の `ShortcutField` の直後に見出し・チェックボックス・`JevKeyField`）
- Modify: `frontend/src/styles/todo.css`（末尾に追記）
- Modify: `README.md`（主な機能に1行）

**Interfaces:**
- Consumes: Task 4 の `GetJevStatus`・`SetJevKey`・`ClearJevKey`・`TestJevKey`、Task 5 の `JevStatus` 型、`Settings.smart_add`
- Produces: `export function JevKeyField(): JSX.Element`。ラベル `Jev APIキー`、ボタン `保存` / `削除` / `接続テスト`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/jevKeyField.test.tsx`:

```tsx
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JevKeyField } from "./JevKeyField";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn(), on: vi.fn(() => () => {}) }));
let status = { supported: true, configured: false, hint: "", invalid: false };
beforeEach(() => {
  status = { supported: true, configured: false, hint: "", invalid: false };
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (method, ...args) => {
    if (method === "GetJevStatus") return status;
    if (method === "SetJevKey") {
      status = { ...status, configured: true, hint: String(args[0]).slice(-4) };
      return undefined;
    }
    if (method === "ClearJevKey") {
      status = { ...status, configured: false, hint: "" };
      return undefined;
    }
    if (method === "TestJevKey") return "invalid";
    return undefined;
  });
});
afterEach(cleanup);
it("saves a key without keeping it in the field and shows only the hint", async () => {
  render(<JevKeyField />);
  const field = (await screen.findByLabelText("Jev APIキー")) as HTMLInputElement;
  expect(field.type).toBe("password");
  expect(field.placeholder).toBe("未設定");
  fireEvent.change(field, { target: { value: "tsk-secret-1234" } });
  fireEvent.click(screen.getByText("保存"));
  await waitFor(() => expect(field.placeholder).toBe("設定済み（末尾 ••••1234）"));
  expect(field.value).toBe("");
  expect(vi.mocked(api).mock.calls.find((c) => c[0] === "SetJevKey")?.[1]).toBe("tsk-secret-1234");
  fireEvent.click(screen.getByText("接続テスト"));
  await screen.findByText("キーが無効です");
  fireEvent.click(screen.getByText("削除"));
  await waitFor(() => expect(field.placeholder).toBe("未設定"));
});
it("shows save errors and the unsupported state", async () => {
  vi.mocked(api).mockImplementation(async (method) => {
    if (method === "GetJevStatus") return status;
    if (method === "SetJevKey") throw "APIキーを入力してください";
    return undefined;
  });
  render(<JevKeyField />);
  const field = await screen.findByLabelText("Jev APIキー");
  fireEvent.change(field, { target: { value: "x" } });
  fireEvent.click(screen.getByText("保存"));
  await screen.findByText("APIキーを入力してください");
  cleanup();
  status = { ...status, supported: false };
  render(<JevKeyField />);
  await screen.findByText("この環境では使えません");
  await act(async () => {});
  expect(screen.queryByLabelText("Jev APIキー")).toBeNull();
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd frontend && npx vitest run src/jevKeyField.test.tsx`
Expected: FAIL（`Failed to resolve import "./JevKeyField"`）

- [ ] **Step 3: 実装する**

`frontend/src/JevKeyField.tsx`:

```tsx
import { useEffect, useState } from "react";
import { api } from "./api";
import { JevStatus } from "./smartAdd";
const results: Record<string, string> = {
  ok: "接続できました",
  invalid: "キーが無効です",
  unreachable: "接続できません",
};
// The key is saved immediately and never comes back from Go; only its last four characters do.
export function JevKeyField() {
  const [status, setStatus] = useState<JevStatus | null>(null),
    [key, setKey] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    api<JevStatus>("GetJevStatus").then((s) => setStatus(s ?? null));
  useEffect(() => {
    void refresh().catch((e) => setMessage(String(e)));
  }, []);
  const run = async (f: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await f());
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };
  if (status && !status.supported)
    return <p className="wide jev-note">この環境では使えません</p>;
  return (
    <div className="wide jev-key">
      <label>
        Jev APIキー
        <input
          type="password"
          autoComplete="off"
          value={key}
          placeholder={
            status?.configured
              ? `設定済み（末尾 ••••${status.hint}）`
              : "未設定"
          }
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          disabled={busy || !key.trim()}
          onClick={() =>
            void run(async () => {
              await api("SetJevKey", key);
              setKey("");
              return "保存しました";
            })
          }
        >
          保存
        </button>
        <button
          disabled={busy || !status?.configured}
          onClick={() =>
            void run(async () => {
              await api("ClearJevKey");
              return "削除しました";
            })
          }
        >
          削除
        </button>
        <button
          disabled={busy || !status?.configured}
          onClick={() =>
            void run(async () => results[await api<string>("TestJevKey")] ?? "")
          }
        >
          接続テスト
        </button>
      </div>
      {status?.invalid && (
        <p className="danger">キーが無効です。保存し直してください。</p>
      )}
      {message && <p role="status">{message}</p>}
      <p className="jev-note">
        入力中のタイトル・未完了タスク名・カテゴリ名を TypeSafe AI
        に送信します。APIキーはこのPCのユーザーで暗号化して保存し、バックアップには含めません（別のPCへ復元したときは再入力が必要です）。
      </p>
    </div>
  );
}
```

注: `接続テスト` の結果が `invalid` のとき、`message` の「キーが無効です」と、`status.invalid` の「キーが無効です。保存し直してください。」が両方出る。テストは完全一致の `findByText("キーが無効です")` で前者だけを拾う。

`frontend/src/SettingsForm.tsx`:
- import に `import { JevKeyField } from "./JevKeyField";` を追加
- 次の箇所

```tsx
            <ShortcutField
              value={v.quick_shortcut ?? "Ctrl+Alt+N"}
              onChange={(quick_shortcut) => patch({ quick_shortcut })}
            />
```

の直後に追加:

```tsx
            <h3 className="wide">スマート追加（Jev）</h3>
            <label className="check wide">
              <input
                type="checkbox"
                checked={!!v.smart_add}
                onChange={(e) => patch({ smart_add: e.target.checked })}
              />
              クイック追加でカテゴリ・重要・期限・通知を推定し、似たタスクを知らせる
            </label>
            <JevKeyField />
```

`frontend/src/styles/todo.css` の末尾に追記:

```css
.jev-key { display: grid; gap: 6px; }
.jev-key label { display: grid; gap: 4px; }
.jev-note { font-size: 12px; color: var(--muted); margin: 0; }
```

`README.md` の「主な機能」の「よく登録するタスク名の入力候補」の次の行に追加:

```markdown
- （任意）Jev（TypeSafe AI）を使った、クイック追加時のカテゴリ・重要・期限・通知の推定と、似たタスクの警告（APIキーが必要。入力中のタイトル・未完了タスク名・カテゴリ名を送信します）
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd frontend && npx vitest run && npx tsc --noEmit -p . && npx prettier --check src`
Expected: 全テスト PASS、型エラーなし、整形差分なし（差分があれば `npx prettier --write` で直して再実行）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/JevKeyField.tsx frontend/src/jevKeyField.test.tsx frontend/src/SettingsForm.tsx frontend/src/styles/todo.css README.md
git commit -m "Add Jev settings with an encrypted API key field"
```

---

### Task 8: 全体の検証

**Files:** なし（失敗があれば該当タスクのファイルを直す）

- [ ] **Step 1: Go 全体**

Run: `go test ./... && go vet ./...`
Expected: 全パッケージ `ok`、vet の出力なし

- [ ] **Step 2: フロント全体とビルド**

Run: `cd frontend && npm test && npm run build`
Expected: 全テスト PASS、`tsc && vite build` が成功

- [ ] **Step 3: アプリ本体のビルド**

Run: `go build -o build/bin/memotodo-dev.exe .`
Expected: ビルド成功（`frontend/dist` が Step 2 で作られている前提）

- [ ] **Step 4: Windows での手動確認（人が行う。結果を報告に書く）**

`MEMOTODO_DATA_DIR` に一時フォルダを指定して起動し、次を確認する:
1. 設定 → スマート追加にチェック → キーを保存 →「設定済み（末尾 ••••xxxx）」と表示される。`<データフォルダ>/jev.key` に平文のキーが入っていない
2. 接続テストが「接続できました」になる（実キーがある場合のみ）
3. クイック追加（Ctrl+Alt+N）で「明日までに請求書を経理に提出」と入力 → 0.4秒ほどでチップ行が出て、ウィンドウが1行分伸びる。✕ で外せる
4. 既存の未完了タスクと同じタイトルを入力 → 重複の警告が出て、› でメイン画面にそのタスクが開く
5. キーを `invalid-key-0000` にして入力 →「Jevのキーが無効です（設定で確認）」が1回だけ出る
6. スマート追加のチェックを外す → チップも通信も出ない（従来どおり）
7. 「画像を含めてバックアップ」で作った ZIP に `jev.key` が入っていない

- [ ] **Step 5: 報告**

全ステップの結果（失敗したもの・手動確認できなかったものを含む）を報告する。コミットは不要。
