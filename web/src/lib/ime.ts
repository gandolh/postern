// Whether a key press belongs to an input method that is still composing a word (a phone keyboard's suggestions,
// accented or non-Latin text). An Enter or Tab then ends the composition, so a handler must leave it alone.
// Safari still sends keyCode 229 for the Enter that ends a composition, after `isComposing` has gone false.

export function isComposingKey(event: { nativeEvent: { isComposing: boolean }; keyCode: number }): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}
