# MemoTodo

付箋感覚で使えるメモ管理と、繰り返しタスク（定期タスク）の管理をひとつにした、Windows常駐向けのデスクトップアプリです。

> **Note:** このアプリのコードは AI（Claude）によって生成されています。

## できること

- **メモ一覧**：本文（複数行可）＋詳細メモ（リッチテキスト・画像添付可）の2フィールド構成。期日・重要フラグ・リマインダー通知を設定可能
  - 画面上部の入力欄から Enter で即登録（Alt+Enter で改行）
  - 期日なし → 期日ありの順で表示。期日なしはドラッグ＆ドロップで並び替え可能
  - 詳細はインライン展開／モーダル表示のどちらかを選択可（設定で切り替え）
  - 本文中の URL・UNCパス・ローカルパスを自動検出し、クリックで既定ブラウザ／エクスプローラーから開く
- **定期タスク**：週次／月次／年次で繰り返すタスクを別パネルで管理。期日超過（残タスク）と期日が近いタスクを分けて表示
- **通知**：リマインダー個別通知、および「期日が近いメモ・期限切れの定期タスク」件数のまとめ通知をアプリ内トーストで表示
- **設定**：詳細表示方式（インライン／モーダル）、定期通知時刻、定期タスクの表示日数をアプリ内で変更可能
- **タスクトレイ常駐**：トレイアイコンからウィンドウの表示／新規メモ追加／終了が可能

## データ保存先

実行ファイル（`memotodo.exe`）と同じフォルダ直下の `data/` に SQLite DB（`todo.db`）、設定（`todo_settings.json`）、添付画像（`todo_images/`）を保存します。OS標準の保存場所（`%AppData%` 等）は使わず単一フォルダに完結させているため、フォルダごとコピー・移動するだけで持ち運べます。

## Windows 起動時に表示される警告について

本アプリの配布物（exe・NSIS インストーラー）にはコード署名（Authenticode）を行っていません。そのため Windows で実行すると、SmartScreen による「Windows によって PC は保護されました」という警告や、環境によっては Microsoft Defender の誤検知警告が表示されることがあります。これは配布元不明の未署名アプリに対する Windows の標準的な挙動であり、本アプリ固有の欠陥ではありません。

- SmartScreen の警告が出た場合は「詳細情報」→「実行」を選択してください。
- Microsoft Defender がウイルスとして検知した場合は誤検知の可能性が高いです。[Microsoft への誤検知報告](https://www.microsoft.com/en-us/wdsi/filesubmission) からファイルを送信すると、判定の見直しに役立ちます。
- 同じビルドが多くのユーザーにダウンロードされ実行されるほど、SmartScreen 上の評価（レピュテーション）が上がり警告が出にくくなっていきます。初回リリース直後は特に警告が出やすい点にご留意ください。
- コード署名証明書を導入すれば警告は解消できますが、本プロジェクトでは現時点で導入していません（`build/windows/installer/project.nsi` に署名フック用のコメントアウト行を用意してあります）。

## 動作環境

Windows での常駐利用を想定して作られています。Wails のクロスプラットフォーム機能を使っているため原理上は macOS / Linux でも動作するはずですが、**Windows 以外での動作確認は行っていません**。

## 開発・ビルド

フロントエンドはバンドラーを使わないプレーンな HTML/CSS/JS（ES Modules）構成のため、**Node.js / npm は不要**です。[Go](https://go.dev/) と [Wails CLI](https://wails.io/docs/gettingstarted/installation) さえあればビルドできます。

```sh
# Wails CLI（初回のみ）
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 開発サーバー
wails dev

# Windows 向けビルド
wails build -platform windows/amd64

# Linux で動作確認する場合（WebKitGTK 4.1 系を使う環境）
wails build -tags webkit2_41
```

Windows インストーラー（NSIS）を作る場合は `-nsis` を付けてください。

```sh
wails build -platform windows/amd64 -nsis
```

生成物は `build/bin/` 配下に出力されます。

## ライセンス

本ソフトウェアは [MIT License](./LICENSE) で公開しています。商用利用を含め、自由に利用・改変・再配布いただけます。

使用している主要な依存ライブラリも商用利用可能な permissive ライセンスのみで構成しています。

- `github.com/wailsapp/wails/v2` — MIT
- `modernc.org/sqlite`（純Go実装・CGO不要） — BSD-3-Clause
- `fyne.io/systray` — Apache-2.0

## サポートについて

もともと作者個人が使うために作ったツールを、そのまま公開しているものです。動作について特に保証はしておりません。
本ソフトウェアに関する質問や、バグや不具合は [Issues](../../issues) にご報告ください。
