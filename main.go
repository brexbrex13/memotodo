package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"memotodo/internal/todo"
	"memotodo/internal/tray"
)

// フロントエンドは Vite でビルドした frontend/dist を埋め込む。
//
//go:embed all:frontend/dist
var assets embed.FS

// singleInstancePort は多重起動防止用のロック代わりに使うポート。
// 実際にHTTPサーバーとしては使わず、接続を受け付けたら「表示要求」とみなす
// 簡易シグナルチャネルとして使う（旧DeskPortalの「同一ポートが使用中なら
// 新規プロセスは起動せず終了する」という多重起動防止の思想を踏襲しつつ、
// 二重起動時は既存インスタンスのウィンドウを前面に出す）。
const singleInstancePort = 18432

const defaultWindowWidth = 1180
const defaultWindowHeight = 800

func main() {
	lock, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", singleInstancePort))
	if err != nil {
		// 既に起動中のインスタンスへ「表示して」と伝えてから終了する
		if conn, dialErr := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", singleInstancePort), 2*time.Second); dialErr == nil {
			conn.Close()
		}
		fmt.Println("MemoTodo はすでに起動しています。")
		return
	}
	defer lock.Close()

	app := NewApp()

	// 多重起動された側からの接続を「メインウィンドウを表示する」トリガーとして扱う
	// （トレイの「開く」と同じ動作）。
	go func() {
		for {
			conn, err := lock.Accept()
			if err != nil {
				return
			}
			conn.Close()
			app.bringToFront()
		}
	}()

	// ウィンドウサイズ・位置はデータフォルダに保存し、次回起動時に復元する
	// （保存先が決まらない場合はデフォルトサイズにフォールバックする）。
	dataDir, dataDirErr := appDataDir()
	width, height := defaultWindowWidth, defaultWindowHeight
	startState := options.Normal
	savedState, hasSavedState := todo.WindowState{}, false
	if dataDirErr == nil {
		if ws, ok := todo.LoadWindowState(dataDir); ok {
			width, height = ws.Width, ws.Height
			if ws.Maximized {
				startState = options.Maximised
			}
			savedState, hasSavedState = ws, true
		}
	}

	saveWindowState := func(ctx context.Context) {
		if dataDirErr != nil {
			return
		}
		w, h := wailsruntime.WindowGetSize(ctx)
		x, y := wailsruntime.WindowGetPosition(ctx)
		maximized := wailsruntime.WindowIsMaximised(ctx)
		if maximized {
			// 最大化中は元のウィンドウサイズ・位置が取得できないため、直前の非最大化時の値を保持する
			if prev, ok := todo.LoadWindowState(dataDir); ok {
				w, h = prev.Width, prev.Height
				x, y = prev.X, prev.Y
			}
		}
		_ = todo.SaveWindowState(dataDir, todo.WindowState{Width: w, Height: h, X: x, Y: y, Maximized: maximized})
	}

	// /todo-images/ 配下は SaveImage で保存した画像ファイルをディスクから配信する。
	// それ以外は埋め込みフロントエンド資産（frontend/）を配信する。
	imagesMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/todo-images/") {
				if app.store == nil {
					http.NotFound(w, r)
					return
				}
				name := strings.TrimPrefix(r.URL.Path, "/todo-images/")
				if strings.Contains(name, "/") || strings.Contains(name, "..") {
					http.Error(w, "forbidden", http.StatusForbidden)
					return
				}
				http.ServeFile(w, r, app.store.ImagesDir()+string(os.PathSeparator)+name)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	frontendFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		fmt.Println("フロントエンド資産の読み込みに失敗しました:", err)
		os.Exit(1)
	}

	quitting := false

	wailsApp := &options.App{
		Title:            "MemoTodo",
		Width:            width,
		Height:           height,
		WindowStartState: startState,
		AssetServer: &assetserver.Options{
			Assets:     frontendFS,
			Middleware: imagesMiddleware,
		},
		BackgroundColour: &options.RGBA{R: 247, G: 246, B: 243, A: 1},
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
			// Width/Height/WindowStartState は options.App 経由で起動時に反映されるが、
			// 位置はそのような起動時オプションが無いため、ここで明示的に復元する。
			if hasSavedState {
				wailsruntime.WindowSetPosition(ctx, savedState.X, savedState.Y)
			}
		},
		OnShutdown: app.shutdown,
		OnBeforeClose: func(ctx context.Context) bool {
			saveWindowState(ctx)
			// ウィンドウを閉じてもアプリは常駐させ、トレイに残す。
			// トレイの「終了」メニューからのみ完全終了する。
			if quitting {
				return false
			}
			// 隠れる直前にまずフラグを倒す。この後に発火するリマインダーは
			// アプリ内トーストが見えないので、ネイティブ通知を出す側へ回す。
			app.windowVisible.Store(false)
			// 定期通知トーストはメインウィンドウが隠れたら消しておく
			// （再度開いたときに古い通知が残っているのを防ぐため）。
			wailsruntime.EventsEmit(ctx, "todo:window-hidden")
			wailsruntime.WindowHide(ctx)
			return true
		},
		Bind: []interface{}{
			app,
		},
	}

	go tray.Run(tray.Callbacks{
		OnShow: func() {
			app.bringToFront()
		},
		OnAddTodo: func() {
			app.bringToFront()
			if app.ctx != nil {
				wailsruntime.EventsEmit(app.ctx, "todo:focus-quick-input")
			}
		},
		OnQuit: func() {
			if app.ctx != nil {
				saveWindowState(app.ctx)
			}
			quitting = true
			if app.ctx != nil {
				wailsruntime.Quit(app.ctx)
			}
		},
	})

	if err := wails.Run(wailsApp); err != nil {
		fmt.Println("Error:", err.Error())
	}
}
