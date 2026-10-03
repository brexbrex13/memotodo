# スマートなクイック追加（Jev 連携）設計

2026-10-03 合意。対象はクイック追加ウィンドウ（トレイの吹き出し）だけ。メイン画面の追加欄は対象外。

## 目的

- クイック追加でタイトルを入力すると、カテゴリ・重要・期限・通知の初期値を Jev（TypeSafe AI の型付き判断モデル）が1回のリクエストで推定して入れる。
- 未完了タスクの中に同じ内容のものがあれば警告する。
- APIキーは設定画面から登録する。キーが未設定・機能がオフ・通信に失敗したときは、今とまったく同じ動きにする。

## 前提と制約

- Jev API: `POST https://api.typesafe.ai/v1/systemone`、`Authorization: Bearer <key>`。リクエストは `{model, state, questions}`、レスポンスは `answers[name]` に `noul`（確率）/ `choice`+`confidence`+`probabilities` / `score`。モデルは `jev-latest` に固定する。
- noul の criteria は `{"criteria": {"true": "...", "false": "..."}}` のように入れ子にする（トップレベルに置くと 200 のまま黙って無視される）。
- choice の候補は1問あたり255個まで。state は約32Kトークン、リクエスト全体は約64Kトークンまで。超えると 400 `max_tokens_exceeded` が返る。
- choice は必ずどれかを選ぶので、範囲外の入力でも高い確信度で誤答する。逃げ道の選択肢（`none_of_these` など）を必ず入れる。
- 外部に送るのは「入力中のタイトル、休眠していないカテゴリ名、未完了タスクのタイトル」だけ。メモ本文・期限・完了済みのタスクは送らない（ユーザー承認済み）。

## 構成

| 部品 | 役割 |
| --- | --- |
| `internal/jev` | Jev の薄い HTTP クライアント。`Ask(ctx, state, questions)` と `Models(ctx)`。タイムアウトは1.5秒。エラーは `ErrUnauthorized`（401/403）、`ErrTooLarge`（400 `max_tokens_exceeded`）、それ以外の一時的な失敗、に分ける。 |
| `internal/smartadd` | 純粋関数。`Build(snapshot, title) Request` で質問を組み立て、`Decide(request, answers) Suggestion` で閾値をかけて結果にする。API なしでテストできる。 |
| `jevkey_windows.go` / `jevkey_other.go` | キーの保存・読み出し・削除。Windows では DPAPI（`CryptProtectData`、ユーザー単位）で暗号化し、`<データフォルダ>/jev.key` に置く。Windows 以外では「未対応」を返す。 |
| `app.go` | Wails に公開するメソッドを追加する（下記）。 |
| `frontend/src/QuickAdd.tsx` | 推定の呼び出し・反映・チップと警告の表示。 |
| `frontend/src/SettingsForm.tsx` | 「スマート追加（Jev）」の見出しで設定を追加。 |

### 公開メソッド（`App`）

- `SuggestQuickAdd(title string, generation uint64) (smartadd.Suggestion, error)`
  - `generation` がクイック追加の今の世代と違えば、空の結果を返す。
  - `smart_add` がオフ、またはキーが無ければ空の結果を返す（エラーにはしない）。
- `GetJevStatus() JevStatus`: `{supported bool, configured bool, hint string /* 末尾4文字 */, invalid bool}`
- `SetJevKey(key string) error` / `ClearJevKey() error`
- `TestJevKey() (string, error)`: `GET /v1/models` を呼び、`ok` / `invalid` / `unreachable` を返す。

キーは Go 側から外に出さない。`Snapshot`・`Settings`・バックアップのどれにも含めない。

## Jev への質問（1回のリクエスト）

state:

```json
{ "input": "<入力中のタイトル>", "categories": ["仕事", "家"], "open_tasks": ["請求書提出", "..."] }
```

| 質問 | 型 | 選択肢 | 反映する条件 |
| --- | --- | --- | --- |
| `category` | choice | 休眠していないカテゴリ名（値は null）＋`none_of_these` | 確信度0.80以上で、`none_of_these` 以外 |
| `important` | noul | true: 重要・影響が大きい / false: 通常の用事 | 確率0.85以上 |
| `deadline` | choice | `none` / `today` / `tomorrow` / `this_week` / `next_week` | 確信度0.80以上で、`none` 以外 |
| `reminder` | choice | `off` / `deadline` / `1h` / `4h` / `tomorrow` / `next-week` | 確信度0.85以上で、`off` 以外 |
| `duplicate` | choice | `t<id>`: 未完了タスクのタイトル ＋ `none` | 確信度0.70以上で、`none` 以外 |

- 閾値は `smartadd` の定数にまとめる。
- カテゴリの選択肢キーは名前そのままにする。返ってきた名前がどのカテゴリにも一致しなければ無視する。同じ名前のカテゴリが複数あるときは並び順で先のものにする。
- `deadline` の日付はフロントで計算する。`today`=今日、`tomorrow`=明日、`this_week`=今週の金曜（金曜を過ぎていれば今週の日曜）、`next_week`=来週の金曜。
- `reminder` は既存の `presetTime`（`reminderPresets.ts`）の種類をそのまま使う。`deadline` は「期限日の通知」で、期限が推定されたときだけ有効にする。
- 未完了タスクは `deleted_at` が空で `status=pending` のものを、作成の新しい順に最大200件送る。タイトルが（前後の空白を除いて）完全に一致するものは Jev を使わず手元で検出し、`duplicate` の結果より優先する。
- 未完了タスクが0件なら `duplicate` の質問は送らない。カテゴリが1件以下なら `category` の質問は送らない。
- 400 `max_tokens_exceeded` が返ったら、`open_tasks` と `duplicate` の候補を半分にして1回だけ再送する。

`Suggestion` の形:

```go
type Suggestion struct {
    CategoryID int64  `json:"category_id"` // 0 = 提案なし
    Important  bool   `json:"important"`
    Deadline   string `json:"deadline"`    // "" | today | tomorrow | this_week | next_week
    Reminder   string `json:"reminder"`    // "" | deadline | 1h | 4h | tomorrow | next-week
    Duplicate  *Dup   `json:"duplicate"`   // {task_id, title} | nil
    Invalid    bool   `json:"invalid"`     // キーが無効（401/403）
}
```

## クイック追加画面の動き

### 推定の呼び出し

- タイトルの入力が0.4秒止まったら `SuggestQuickAdd` を呼ぶ。
- 次のときは呼ばない: `GetJevStatus` が未設定または `smart_add` がオフ、IME で変換中、前後の空白を除いて2文字未満、直前に推定した文字列と同じ、キーが無効と判明済み（そのウィンドウ表示中）。
- 呼び出しごとに連番を振り、最新以外の応答は捨てる。既存の `operation`（破棄・登録で進む）と `generation`（ウィンドウ表示ごとに進む）が変わった後の応答も捨てる。

### 反映

- 対象は `category_id`・`important`・`deadline`・`reminder_*` の4つ。
- ユーザーが手で操作した欄（オプション欄での変更、チップの ✕）は「触った」と記録し、そのウィンドウでの入力が終わる（登録・破棄）まで自動では上書きしない。
- 自動で入れた欄は、新しい推定が来たら置き換える。新しい推定に提案が無い欄は空に戻す。
- タイトルを空にしたら、自動で入れた値と重複の警告を消す。

### 表示

```
┌ タスクを追加 ──────────── × ┐
│ 請求書を経理に提出        🕒 │
│ 🏷経理 ✕  ★重要 ✕  📅明日 ✕  ⏰明日9:00 ✕ │
│ ⚠ 似たタスクがあります: 請求書提出 › │
└──────────────────────┘
```

- 自動で入った値は、入力欄の下にチップとして1行で並べる。✕ でその欄だけ空に戻し、「触った」扱いにする。
- 重複は警告として1行で表示する。› で `OpenTask(task_id)` を呼んでメイン画面に開く。登録は止めない。
- キーが無効だったら「Jevのキーが無効です（設定で確認）」と1行表示する。
- ウィンドウの高さ: `SetQuickAddLayout` に追加行の数（チップ・重複の警告・キー無効の表示で 0〜3）を渡し、105px に1行あたりの高さを足す。オプション欄を開いた状態（430px）では、チップと警告はオプション欄の上に入れ、高さは変えない。
- 入力候補の別ウィンドウは入力欄の下に重なって出るので、候補が出ている間はチップ行が隠れる。これは許容する。

### 登録

- Enter・登録ボタンの時点で入っている値で `SaveTask` を呼ぶ。`category_id` も渡す（0なら既定のカテゴリ）。
- 推定の応答は待たない。登録した後に届いた応答は `operation` が進んでいるので捨てる。

## 設定画面

`SettingsForm` に見出し「スマート追加（Jev）」を追加する。

- `スマート追加を使う` チェックボックス → `Settings.smart_add`（bool、既定 false）。ほかの設定と同じく保存ボタンで確定する。
- APIキー欄（`type=password`）と `保存` / `削除` / `接続テスト` のボタン。キーは Settings の保存とは別に、ボタンを押した時点で `SetJevKey` / `ClearJevKey` を呼ぶ。保存したら欄を空にし、「設定済み（末尾 ••••ab12）」と表示する。
- `接続テスト` の結果は「接続できました」「キーが無効です」「接続できません」で表示する。
- 補足文: 「入力中のタイトル・未完了タスク名・カテゴリ名を TypeSafe AI に送信します。APIキーはこのPCのユーザーで暗号化して保存し、バックアップには含めません（別のPCへ復元したときは再入力が必要です）。」（復元は `jev.key` に触れないので、同じPCでの復元ではキーは残る）
- Windows 以外（`supported=false`）では、キー欄を無効にして「この環境では使えません」と表示する。

## エラー時の扱い

| 状況 | 動き |
| --- | --- |
| タイムアウト（1.5秒）・通信エラー・5xx・応答の形が不正 | 空の結果を返す。画面には何も出さない |
| 401 / 403 | `Invalid=true` を返し、クイック追加に1行表示。そのウィンドウ表示中は再リクエストしない。`GetJevStatus().invalid` も true にする（キーを保存し直すまで） |
| 400 `max_tokens_exceeded` | 未完了タスクを半分にして1回だけ再送。それでも失敗したら空の結果 |
| choice の答えが候補に無い | その欄は無視する |
| `jev.key` の復号に失敗（別ユーザー・別PC） | 未設定として扱う |

## テスト（実際の API は呼ばない）

- `internal/jev`: `httptest` でワイヤ形式を固定する（noul の criteria が入れ子、choice の null 値、Bearer ヘッダ、`model`）。ステータスごとのエラーの振り分けと、タイムアウト。
- `internal/smartadd`: 休眠カテゴリを除く、未完了タスクは作成の新しい順に200件まで、カテゴリ1件以下・未完了0件のときに質問を省く、タイトル完全一致の手元検出、各閾値の境界、逃げ道を選んだとき、候補に無い答え、同名カテゴリ。
- `app`: `Snapshot`・バックアップにキーが含まれないこと。`smart_add` オフ・キー無しで空の結果。`generation` 不一致で空の結果。`max_tokens_exceeded` で半分にして再送すること（Jev クライアントは差し替え可能にする）。
- `jevkey_windows`: 保存して読み戻せる、削除できる、壊れたファイルは未設定として扱う。
- フロント `quickAdd.test.tsx`: 0.4秒待ってから呼ぶ、IME 変換中は呼ばない、古い応答を捨てる、手で触った欄を上書きしない、チップの ✕、重複の警告と ›、キー無効の表示、Enter が推定を待たない、`category_id` が `SaveTask` に渡る。
- 期限の日付計算（`this_week` / `next_week` の曜日ごとの境界）は単体テストにする。

## 対象外

- メイン画面の追加欄への組み込み。
- クイック追加へのカテゴリ選択欄の追加。
- 定期タスク化の提案・放置タスクの棚卸しなど、ほかのアイデア。
- 推定の精度の実測と閾値の調整（実際に使ってから行う）。
