// カテゴリの色プリセット。既存パレット（--accent 等）のトーンに合わせつつ、
// 一覧で複数カテゴリを見分けやすいよう色相を分散させている。
export const CATEGORY_COLOR_PRESETS = [
  '#C8604A', // テラコッタ（既定アクセントと同系）
  '#3D7A5C', // グリーン
  '#3D6BAA', // ブルー
  '#8A5CB0', // パープル
  '#C08000', // マスタード
  '#B94040', // レッド
  '#4A8A8A', // ティール
  '#8A6D3D', // ブラウン
] as const

export function defaultCategoryColor(existingCount: number): string {
  return CATEGORY_COLOR_PRESETS[existingCount % CATEGORY_COLOR_PRESETS.length]
}
