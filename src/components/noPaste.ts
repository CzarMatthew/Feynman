// Shared handlers that block paste and drop in a text box.
import type React from "react";

export function blockPasteHandlers(onBlocked: (kind: "paste" | "drop") => void) {
  return {
    onPaste: (e: React.ClipboardEvent) => {
      e.preventDefault();
      onBlocked("paste");
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onBlocked("drop");
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onBeforeInput: (e: React.FormEvent) => {
      const t = (e.nativeEvent as InputEvent).inputType || "";
      if (t === "insertFromPaste" || t === "insertFromPasteAsQuotation" || t === "insertFromDrop" || t === "insertFromYank") {
        e.preventDefault();
        onBlocked(t === "insertFromDrop" ? "drop" : "paste");
      }
    },
  };
}
