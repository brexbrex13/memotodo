import { SmartAdd } from "./useSmartAdd";
// Chips for automatic values, the similar-task warning and the invalid-key notice.
export function SmartHints({
  smart,
  onOpen,
}: {
  smart: SmartAdd;
  onOpen: (taskId: number) => void;
}) {
  return (
    <>
      {smart.chips.length > 0 && (
        <div className="smart-chips" aria-label="推定した初期値">
          {smart.chips.map((c) => (
            <span key={c.field} className="smart-chip">
              {c.label}
              <button
                aria-label={`${c.label}を外す`}
                onClick={() => smart.drop(c.field)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {smart.duplicate && (
        <button
          className="smart-duplicate"
          onClick={() => onOpen(smart.duplicate!.task_id)}
        >
          ⚠ 似たタスクがあります: {smart.duplicate.title} ›
        </button>
      )}
      {smart.invalid && (
        <p className="smart-invalid" role="status">
          Jevのキーが無効です（設定で確認）
        </p>
      )}
    </>
  );
}
