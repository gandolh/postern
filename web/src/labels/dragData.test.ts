import { describe, expect, it } from "vitest";
import { CONVERSATION_DRAG_TYPE, isConversationDrag, readDrag, writeDrag } from "./dragData";

function transfer() {
  const data = new Map<string, string>();
  return {
    types: [] as string[],
    effectAllowed: "none",
    setData(type: string, value: string) {
      data.set(type, value);
      this.types = [...data.keys()];
    },
    getData: (type: string) => data.get(type) ?? "",
  };
}

describe("conversation drag data", () => {
  it("round-trips the ids and the select-all flag", () => {
    const t = transfer();
    writeDrag(t as unknown as DataTransfer, { ids: ["T1", "T2"], all: true });
    expect(isConversationDrag(t)).toBe(true);
    expect(t.effectAllowed).toBe("move");
    expect(readDrag(t)).toEqual({ ids: ["T1", "T2"], all: true });
  });

  it("ignores other drags and malformed data", () => {
    const t = transfer();
    expect(isConversationDrag(t)).toBe(false);
    expect(readDrag(t)).toBeNull();
    t.setData(CONVERSATION_DRAG_TYPE, "{oops");
    expect(readDrag(t)).toBeNull();
    t.setData(CONVERSATION_DRAG_TYPE, JSON.stringify({ ids: [] }));
    expect(readDrag(t)).toBeNull();
  });
});
