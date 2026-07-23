package main

import (
	"context"
	"embed"
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"memotodo/internal/notify"
	"memotodo/internal/todo"
)

//go:embed build/appicon.png
var appIconPNG embed.FS

// App は Wails のフロントエンド（JS）から呼び出せるバインディングを提供する。
// 旧 Flask REST API 層（apps/todo/__init__.py）が担っていた役割を置き換える。
type App struct {
	ctx           context.Context
	store         *todo.Store
	scheduler     *todo.Scheduler
	windowVisible atomic.Bool
	// closeToTray はウィンドウを閉じずにトレイへ格納する処理（main.go 側で設定）。
	// フレームレス化でOSの×ボタンが無くなったため、ミニタイトルバーの×ボタンから
	// CloseToTray 経由でこれを呼び出す。
	closeToTray func()
}

// NewApp は App を生成する。DBオープン等は startup 時に行う。
func NewApp() *App {
	return &App{}
}

// startup は Wails 起動時に一度だけ呼ばれる。
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// 起動直後はウィンドウが見えている。スケジューラ開始で即発火するリマインダーが
	// windowVisible を読む前にフラグを立てておく（false のままだとネイティブ通知が二重に出る）。
	a.windowVisible.Store(true)

	dataDir, err := appDataDir()
	if err != nil {
		wailsruntime.LogErrorf(ctx, "データディレクトリの決定に失敗しました: %v", err)
		return
	}
	store, err := todo.NewStore(dataDir)
	if err != nil {
		wailsruntime.LogErrorf(ctx, "Storeの初期化に失敗しました: %v", err)
		return
	}
	a.store = store

	sched := todo.NewScheduler(store)
	sched.OnReminder = a.handleReminderNotify
	sched.OnPeriodic = a.handlePeriodicNotify
	a.scheduler = sched
	if err := sched.Start(); err != nil {
		wailsruntime.LogErrorf(ctx, "スケジューラの起動に失敗しました: %v", err)
	}

	a.initWindowsNotifications(dataDir)
}

// shutdown は Wails 終了時に呼ばれる。
func (a *App) shutdown(ctx context.Context) {
	if a.scheduler != nil {
		a.scheduler.Stop()
	}
	if a.store != nil {
		a.store.Close()
	}
}

// initWindowsNotifications はWindowsのアクションセンター通知を使えるようにする。
// 通知アイコンはトースト側の制約でファイルパス指定が必要なため、埋め込み画像を
// データフォルダへ書き出してそのパスを渡す。通知クリック時はウィンドウを前面化する
// （クリックは明示的な「見たい」意思表示なので、通常のフォーカス保護の対象外にする）。
func (a *App) initWindowsNotifications(dataDir string) {
	iconPath := filepath.Join(dataDir, "notify_icon.png")
	if data, err := appIconPNG.ReadFile("build/appicon.png"); err == nil {
		_ = os.WriteFile(iconPath, data, 0o644)
	} else {
		iconPath = ""
	}
	notify.Init(iconPath, func() {
		a.bringToFront()
	})
}

// appDataDir はDB・設定・画像を保存するディレクトリを返す（初回は作成する）。
// %AppData% 等のOS標準の場所は使わず、実行ファイルと同じフォルダの直下（data/）に
// 置くことで、フォルダごとコピーするだけで持ち運べるポータブル運用にする。
func appDataDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return "", err
	}
	dir := filepath.Join(filepath.Dir(exe), "data")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// --- 通知（リマインダー・定期通知） ---
//
// Wails v2 はメインウィンドウを1つしか持てないため、旧実装のような別プロセス・
// 別ウィンドウでのポップアップ表示は行わず、Wailsのイベント機構でフロントエンドへ
// 通知を送り、アプリ内のオーバーレイ（トースト）として表示する。
// あわせてウィンドウを前面に出し、閉じるまで（またはタイムアウトで）残る、という
// 挙動そのものはフロントエンド側のオーバーレイ実装で再現する。

// ReminderNotifyPayload はリマインダー通知イベントのペイロード。
type ReminderNotifyPayload struct {
	Todo todo.Todo `json:"todo"`
}

func (a *App) handleReminderNotify(todoID int64) {
	reminded := true
	if _, err := a.store.UpdateTodo(todoID, todo.TodoUpdate{Reminded: &reminded}); err != nil {
		wailsruntime.LogErrorf(a.ctx, "リマインダー通知済みフラグの更新に失敗しました: %v", err)
	}
	t, ok, err := a.store.GetTodo(todoID)
	if err != nil || !ok {
		return
	}

	// アプリ内トースト（todo.js側）は常に表示する。Windowsトースト／ウィンドウ前面化は
	// それぞれユーザー設定でON/OFFできる（両方OFFなら「アプリ内のみ」になる）。
	settings, _ := a.store.LoadSettings()
	method := settings.ReminderNotifyMethod

	wailsruntime.EventsEmit(a.ctx, "todo:reminder", ReminderNotifyPayload{Todo: t})

	if shouldPushNative(a.windowVisible.Load(), wailsruntime.WindowIsMinimised(a.ctx), method.Toast) {
		notify.Push("リマインダー", t.Title)
	}
	if method.BringToFront {
		a.bringToFront()
	}
}

// handlePeriodicNotify は「表示すべき通知がある」ことだけを知らせるトリガーで、
// 内容（対象メモ・定期タスクの一覧）はフロントエンドが GetNearOrOverdueMemos /
// GetRecurringPanel を呼んで自前で組み立てる（データ整形をフロント1箇所に寄せるため）。
func (a *App) handlePeriodicNotify() {
	settings, _ := a.store.LoadSettings()
	method := settings.PeriodicNotifyMethod

	wailsruntime.EventsEmit(a.ctx, "todo:periodic")

	if shouldPushNative(a.windowVisible.Load(), wailsruntime.WindowIsMinimised(a.ctx), method.Toast) {
		if body := a.periodicNotifySummary(); body != "" {
			notify.Push("MemoTodo リマインド", body)
		}
	}
	if method.BringToFront {
		a.bringToFront()
	}
}

// periodicNotifySummary はWindows通知向けの短い件数サマリーを組み立てる。
func (a *App) periodicNotifySummary() string {
	memos, err := a.store.GetNearOrOverdueMemos()
	if err != nil {
		return ""
	}
	badge, err := a.store.GetRecurringBadgeCounts()
	if err != nil {
		return ""
	}
	var parts []string
	if badge.Overdue > 0 {
		parts = append(parts, fmt.Sprintf("定期タスクの残タスクが%d件", badge.Overdue))
	}
	if len(memos) > 0 {
		parts = append(parts, fmt.Sprintf("期日が近い・超過したタスクが%d件", len(memos)))
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "\n")
}

// CloseToTray はミニタイトルバーの×ボタンから呼ばれる。
// OSクローズ操作（OnBeforeClose）と同じくウィンドウを隠してトレイに常駐させる。
func (a *App) CloseToTray() {
	if a.closeToTray != nil {
		a.closeToTray()
	}
}

// bringToFront はメインウィンドウを表示・前面化する。
// トレイクリック・多重起動時の通知・通知クリック等の明示的な操作や、
// 通知設定で「最前面に表示する」がONの場合に呼ばれる。
func (a *App) bringToFront() {
	if a.ctx == nil {
		return
	}
	wailsruntime.WindowShow(a.ctx)
	wailsruntime.WindowUnminimise(a.ctx)
	a.windowVisible.Store(true)
}

// shouldPushNative は OS ネイティブ通知（notify.Push）を出すべきか判定する。
// ウィンドウが既に見えている（表示中かつ非最小化）場合のみ、アプリ内トーストが
// 目に入っているためネイティブ通知は抑制する（二重通知防止＝Discord 挙動）。
// 「最前面表示」設定（bringToFront）は通知発火後にウィンドウを呼び出すだけの
// 別チャンネルであり、ネイティブ通知の抑制条件には含めない（両方ONなら両方出す）。
func shouldPushNative(visible, minimised, toastEnabled bool) bool {
	if !toastEnabled {
		return false
	}
	if visible && !minimised {
		return false
	}
	return true
}

// --- メモ CRUD ---

// GetNearOrOverdueMemos は定期通知の一覧表示用に、期日が近い・超過しているメモを返す。
func (a *App) GetNearOrOverdueMemos() ([]todo.Todo, error) {
	todos, err := a.store.GetNearOrOverdueMemos()
	if err != nil {
		return nil, err
	}
	return todos, nil
}

func (a *App) GetTodos(status string) ([]todo.Todo, error) {
	if status != "pending" && status != "done" {
		return nil, fmt.Errorf("statusはpendingまたはdoneを指定してください")
	}
	todos, err := a.store.GetTodos(status)
	if err != nil {
		return nil, err
	}
	for i := range todos {
		todos[i].Links = todo.ParseLinks(todos[i].Title + "\n" + todos[i].Memo)
	}
	return todos, nil
}

func (a *App) GetTodo(id int64) (todo.Todo, error) {
	t, ok, err := a.store.GetTodo(id)
	if err != nil {
		return todo.Todo{}, err
	}
	if !ok {
		return todo.Todo{}, fmt.Errorf("メモが見つかりません")
	}
	t.Links = todo.ParseLinks(t.Title + "\n" + t.Memo)
	return t, nil
}

// CreateTodoRequest はメモ新規登録の入力。
type CreateTodoRequest struct {
	Title           string `json:"title"`
	Memo            string `json:"memo"`
	Deadline        string `json:"deadline"`
	ReminderEnabled bool   `json:"reminder_enabled"`
	ReminderAt      string `json:"reminder_at"`
	IsImportant     bool   `json:"is_important"`
	// CategoryID は所属カテゴリ（0または未指定=通常タスク）。
	CategoryID int64 `json:"category_id"`
}

func (a *App) CreateTodo(req CreateTodoRequest) (int64, error) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		return 0, fmt.Errorf("本文を入力してください")
	}
	id, err := a.store.CreateTodo(todo.CreateTodoInput{
		Title:           title,
		Memo:            req.Memo,
		Deadline:        req.Deadline,
		ReminderEnabled: req.ReminderEnabled,
		ReminderAt:      req.ReminderAt,
		IsImportant:     req.IsImportant,
		CategoryID:      req.CategoryID,
	})
	if err != nil {
		return 0, err
	}
	a.scheduler.RescheduleReminders()
	return id, nil
}

// UpdateTodoRequest はメモの部分更新の入力（未指定フィールドはnil）。
type UpdateTodoRequest struct {
	Title           *string `json:"title"`
	Memo            *string `json:"memo"`
	Deadline        *string `json:"deadline"`
	ReminderEnabled *bool   `json:"reminder_enabled"`
	ReminderAt      *string `json:"reminder_at"`
	Status          *string `json:"status"`
	DoneAt          *string `json:"done_at"`
	IsImportant     *bool   `json:"is_important"`
	// CategoryID: nil=変更なし、0=通常に戻す、それ以外=そのカテゴリへ変更。
	CategoryID *int64 `json:"category_id"`
}

func (a *App) UpdateTodo(id int64, req UpdateTodoRequest) error {
	ok, err := a.store.UpdateTodo(id, todo.TodoUpdate{
		Title:           req.Title,
		Memo:            req.Memo,
		Deadline:        req.Deadline,
		ReminderEnabled: req.ReminderEnabled,
		ReminderAt:      req.ReminderAt,
		Status:          req.Status,
		DoneAt:          req.DoneAt,
		IsImportant:     req.IsImportant,
		CategoryID:      req.CategoryID,
	})
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("メモが見つかりません")
	}
	a.scheduler.RescheduleReminders()
	return nil
}

func (a *App) CompleteTodo(id int64) error {
	ok, err := a.store.CompleteTodo(id)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("メモが見つかりません")
	}
	return nil
}

// RestoreTodo は完了済みメモを未完了に戻す。
func (a *App) RestoreTodo(id int64) error {
	pending := "pending"
	empty := ""
	ok, err := a.store.UpdateTodo(id, todo.TodoUpdate{Status: &pending, DoneAt: &empty})
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("メモが見つかりません")
	}
	return nil
}

func (a *App) DeleteTodo(id int64) error {
	ok, err := a.store.DeleteTodo(id)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("メモが見つかりません")
	}
	return nil
}

func (a *App) BulkDeleteDoneTodos() (int64, error) {
	return a.store.DeleteAllDoneTodos()
}

func (a *App) ReorderTodos(order []int64) error {
	return a.store.ReorderTodos(order)
}

// SetTodoCategory はメモの所属カテゴリを変更する（D&D仕分け用）。
// categoryId は 0=通常タスクに戻す、それ以外=そのカテゴリへ変更。
// UpdateTodo の部分更新（category_id だけを指定した *int64 送信）は、
// フロントエンドから見て「0」と「未指定」の区別が実機で意図通りに機能しない
// ケースが確認されたため、専用の必須引数を持つエンドポイントとして切り出す。
func (a *App) SetTodoCategory(id int64, categoryId int64) error {
	ok, err := a.store.UpdateTodo(id, todo.TodoUpdate{CategoryID: &categoryId})
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("メモが見つかりません")
	}
	return nil
}

// ToggleImportant は重要フラグを反転する。
func (a *App) ToggleImportant(id int64) error {
	t, ok, err := a.store.GetTodo(id)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("メモが見つかりません")
	}
	newVal := !t.IsImportant
	ok, err = a.store.UpdateTodo(id, todo.TodoUpdate{IsImportant: &newVal})
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("メモが見つかりません")
	}
	return nil
}

// SnoozeReminder はリマインダーをスヌーズする。amount は "30"/"60"（分）または "tomorrow"。
func (a *App) SnoozeReminder(id int64, amount string) error {
	var next time.Time
	now := time.Now()
	switch amount {
	case "tomorrow":
		next = time.Date(now.Year(), now.Month(), now.Day()+1, 9, 0, 0, 0, now.Location())
	default:
		minutes := 30
		if amount == "60" {
			minutes = 60
		}
		next = now.Add(time.Duration(minutes) * time.Minute)
	}
	reminderAt := next.Format("2006-01-02T15:04:05")
	enabled := true
	ok, err := a.store.UpdateTodo(id, todo.TodoUpdate{ReminderEnabled: &enabled, ReminderAt: &reminderAt})
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("メモが見つかりません")
	}
	a.scheduler.RescheduleReminders()
	return nil
}

// --- カテゴリ ---

func (a *App) GetCategories() ([]todo.Category, error) {
	categories, err := a.store.GetCategories()
	if err != nil {
		return nil, err
	}
	if categories == nil {
		categories = []todo.Category{}
	}
	return categories, nil
}

// CreateCategoryRequest はカテゴリ新規作成の入力。
type CreateCategoryRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (a *App) CreateCategory(req CreateCategoryRequest) (int64, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return 0, fmt.Errorf("カテゴリ名を入力してください")
	}
	return a.store.CreateCategory(name, req.Color)
}

// UpdateCategoryRequest はカテゴリの部分更新入力。
type UpdateCategoryRequest struct {
	Name  *string `json:"name"`
	Color *string `json:"color"`
}

func (a *App) UpdateCategory(id int64, req UpdateCategoryRequest) error {
	if req.Name != nil && strings.TrimSpace(*req.Name) == "" {
		return fmt.Errorf("カテゴリ名を入力してください")
	}
	ok, err := a.store.UpdateCategory(id, todo.CategoryUpdate{
		Name:  req.Name,
		Color: req.Color,
	})
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("カテゴリが見つかりません")
	}
	return nil
}

func (a *App) DeleteCategory(id int64) error {
	ok, err := a.store.DeleteCategory(id)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("カテゴリが見つかりません")
	}
	return nil
}

func (a *App) ReorderCategories(order []int64) error {
	return a.store.ReorderCategories(order)
}

// --- 定期タスク ---

func (a *App) GetRecurringTasks() ([]todo.RecurringTask, error) {
	return a.store.GetRecurringTasks(false)
}

func (a *App) GetRecurringTask(id int64) (todo.RecurringTask, error) {
	t, ok, err := a.store.GetRecurringTask(id)
	if err != nil {
		return todo.RecurringTask{}, err
	}
	if !ok {
		return todo.RecurringTask{}, fmt.Errorf("定期タスクが見つかりません")
	}
	return t, nil
}

// CreateRecurringTaskRequest は定期タスク新規作成の入力。
type CreateRecurringTaskRequest struct {
	Title       string `json:"title"`
	PeriodType  string `json:"period_type"`
	PeriodValue string `json:"period_value"`
	Memo        string `json:"memo"`
}

func (a *App) CreateRecurringTask(req CreateRecurringTaskRequest) (int64, error) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		return 0, fmt.Errorf("タイトルは必須です")
	}
	if req.PeriodType != "weekly" && req.PeriodType != "monthly" && req.PeriodType != "yearly" {
		return 0, fmt.Errorf("period_typeはweekly/monthly/yearlyで指定してください")
	}
	periodValue := strings.TrimSpace(req.PeriodValue)
	if periodValue == "" {
		return 0, fmt.Errorf("period_valueは必須です")
	}
	return a.store.CreateRecurringTask(todo.CreateRecurringTaskInput{
		Title:       title,
		PeriodType:  req.PeriodType,
		PeriodValue: periodValue,
		Memo:        req.Memo,
	})
}

// UpdateRecurringTaskRequest は定期タスク定義の部分更新入力。
type UpdateRecurringTaskRequest struct {
	Title       *string `json:"title"`
	Memo        *string `json:"memo"`
	PeriodType  *string `json:"period_type"`
	PeriodValue *string `json:"period_value"`
	IsActive    *bool   `json:"is_active"`
}

func (a *App) UpdateRecurringTask(id int64, req UpdateRecurringTaskRequest) error {
	ok, err := a.store.UpdateRecurringTask(id, todo.RecurringTaskUpdate{
		Title:       req.Title,
		Memo:        req.Memo,
		PeriodType:  req.PeriodType,
		PeriodValue: req.PeriodValue,
		IsActive:    req.IsActive,
	})
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("定期タスクが見つかりません")
	}
	return nil
}

func (a *App) DeleteRecurringTask(id int64) error {
	ok, err := a.store.DeleteRecurringTask(id)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("定期タスクが見つかりません")
	}
	return nil
}

func (a *App) ToggleRecurringTask(id int64) error {
	ok, err := a.store.ToggleRecurringTask(id)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("定期タスクが見つかりません")
	}
	return nil
}

func (a *App) GetRecurringPanel() (todo.RecurringPanelData, error) {
	return a.store.GetRecurringPanelData()
}

// --- 設定 ---

func (a *App) GetSettings() (todo.Settings, error) {
	return a.store.LoadSettings()
}

// SaveSettingsRequest は設定保存の入力（未指定フィールドはnil/空）。
type SaveSettingsRequest struct {
	NotifyTimes          []string           `json:"notify_times"`
	DetailPattern        *string            `json:"detail_pattern"`
	RecurringDisplayDays map[string]int     `json:"recurring_display_days"`
	TodoNearDeadlineDays *int               `json:"todo_near_deadline_days"`
	ReminderNotifyMethod *todo.NotifyMethod `json:"reminder_notify_method"`
	PeriodicNotifyMethod *todo.NotifyMethod `json:"periodic_notify_method"`
	ImageOpenMethod      *string            `json:"image_open_method"`
	CollapsedCategories  []int64            `json:"collapsed_categories"`
}

func (a *App) SaveSettings(req SaveSettingsRequest) (todo.Settings, error) {
	if req.DetailPattern != nil && *req.DetailPattern != "inline" && *req.DetailPattern != "modal" {
		return todo.Settings{}, fmt.Errorf("detail_patternはinlineまたはmodalで指定してください")
	}
	if req.ImageOpenMethod != nil && *req.ImageOpenMethod != "inapp" && *req.ImageOpenMethod != "system" {
		return todo.Settings{}, fmt.Errorf("image_open_methodはinappまたはsystemで指定してください")
	}
	settings, err := a.store.SaveSettings(todo.SettingsUpdate{
		NotifyTimes:          req.NotifyTimes,
		DetailPattern:        req.DetailPattern,
		RecurringDisplayDays: req.RecurringDisplayDays,
		TodoNearDeadlineDays: req.TodoNearDeadlineDays,
		ReminderNotifyMethod: req.ReminderNotifyMethod,
		PeriodicNotifyMethod: req.PeriodicNotifyMethod,
		ImageOpenMethod:      req.ImageOpenMethod,
		CollapsedCategories:  req.CollapsedCategories,
	})
	if err != nil {
		return todo.Settings{}, err
	}
	if req.NotifyTimes != nil {
		a.scheduler.ReschedulePeriodicNotifies()
	}
	return settings, nil
}

// --- 画像添付 ---

// SaveImage はクリップボード画像（data URL）をファイル保存し、
// フロントエンドの <img src> に使える相対URLを返す。
// 実ファイルは main.go の AssetServer Middleware から配信する。
func (a *App) SaveImage(imageDataURL string) (string, error) {
	header, encoded, found := strings.Cut(imageDataURL, ",")
	if !found {
		return "", fmt.Errorf("画像データの形式が不正です")
	}
	ext := "png"
	if i := strings.Index(header, "image/"); i >= 0 {
		rest := header[i+len("image/"):]
		if j := strings.IndexAny(rest, ";,"); j >= 0 {
			rest = rest[:j]
		}
		if rest != "" {
			ext = rest
		}
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("画像データの形式が不正です")
	}

	filename := fmt.Sprintf("%s.%s", time.Now().Format("20060102_150405.000000"), ext)
	savePath := filepath.Join(a.store.ImagesDir(), filename)
	if err := os.WriteFile(savePath, data, 0o644); err != nil {
		return "", err
	}
	return "/todo-images/" + filename, nil
}

// --- リンクを開く ---

// OpenURL は既定ブラウザでURLを開く。
func (a *App) OpenURL(url string) error {
	wailsruntime.BrowserOpenURL(a.ctx, url)
	return nil
}

// OpenLocalPath はUNCパス・ローカルパスをOSのファイルエクスプローラで開く。
func (a *App) OpenLocalPath(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("パスが指定されていません")
	}
	if strings.HasPrefix(path, "file://") {
		if u, err := decodeFileURL(path); err == nil {
			path = u
		}
	}
	return openWithOS(path)
}

// OpenImage はメモに貼り付けた画像をOS標準の画像ビューワで開く。
// src は SaveImage が返す "/todo-images/xxx.png" 形式の相対URL。
func (a *App) OpenImage(src string) error {
	name := strings.TrimPrefix(src, "/todo-images/")
	if name == "" || name == src || strings.Contains(name, "/") || strings.Contains(name, "..") {
		return fmt.Errorf("不正な画像パスです")
	}
	return openWithOS(filepath.Join(a.store.ImagesDir(), name))
}

// openWithOS は指定パスをOS標準の関連付けアプリで開く。
func openWithOS(path string) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("指定されたパスが存在しません")
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", path)
	case "darwin":
		cmd = exec.Command("open", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	return cmd.Start()
}

func decodeFileURL(u string) (string, error) {
	rest := strings.TrimPrefix(u, "file://")
	return url.QueryUnescape(rest)
}
