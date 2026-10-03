import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { useState } from "react";
import { useSmartAdd } from "./useSmartAdd";
import { blankOptions, Suggestion } from "./smartAdd";
const suggestion: Suggestion = {
  category_id: 0,
  important: true,
  deadline: "",
  reminder: "",
  duplicate: null,
  invalid: false,
};
it("drops an in-flight response after disabling AI or changing endpoint", async () => {
  for (const change of [
    { enabled: false, scope: "a" },
    { enabled: true, scope: "b" },
  ]) {
    let resolve!: (s: Suggestion) => void;
    let requested = false;
    const { result, rerender, unmount } = renderHook(
      ({ enabled, scope }) => {
        const [options, setOptions] = useState(blankOptions);
        return {
          options,
          smart: useSmartAdd({
            text: "提出する",
            options,
            setOptions,
            enabled,
            scope,
            defaultTime: "09:00",
            categories: [],
            ask: () => {
              requested = true;
              return new Promise<Suggestion>((r) => {
                resolve = r;
              });
            },
          }),
        };
      },
      { initialProps: { enabled: true, scope: "a" } },
    );
    await waitFor(() => expect(requested).toBe(true));
    rerender(change);
    await act(async () => resolve(suggestion));
    expect(result.current.options.important).toBe(false);
    unmount();
  }
});
it("resumes after an invalid key is replaced and clears automatic fields when disabled", async () => {
  let calls = 0;
  const { result, rerender } = renderHook(
    ({ enabled, scope }) => {
      const [options, setOptions] = useState(blankOptions);
      return {
        options,
        smart: useSmartAdd({
          text: "提出する",
          options,
          setOptions,
          enabled,
          scope,
          defaultTime: "09:00",
          categories: [],
          ask: async () =>
            ++calls === 1 ? { ...suggestion, invalid: true } : suggestion,
        }),
      };
    },
    { initialProps: { enabled: true, scope: "revision1" } },
  );
  await waitFor(() => expect(result.current.smart.invalid).toBe(true));
  rerender({ enabled: true, scope: "revision2" });
  await waitFor(() => expect(result.current.options.important).toBe(true));
  expect(result.current.smart.invalid).toBe(false);
  rerender({ enabled: false, scope: "revision2" });
  await waitFor(() => expect(result.current.options.important).toBe(false));
});
