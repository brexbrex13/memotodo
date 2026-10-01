# Windowsビルドの配布

Wails v3版のビルドは`.github/workflows/ci.yml`と`release.yml`に定義しています。

通常のPR・mainへの変更で、ロジック・画面・Windowsネイティブ通知を検証し、ActionsにポータブルZIPを添付します。ZIP内のMemoTodo.exeを、書き込み可能なフォルダに展開してください。Windows 10/11とWebView2 Evergreen Runtimeが必要です。

Releaseワークフローを手動実行すると、ActionsにZIPを出力します。`v*`タグでは同じZIPを添付したドラフトReleaseを作り、公開は手動です。NSISインストーラーは使用しません。

依存関係とWailsコミットは固定しています。保存先はexe横のdataで、旧todo.dbとの移行・互換性はありません。使用手順・バックアップ・復元はルートREADMEを参照してください。
