// Gmail's keyboard shortcuts and the help sheet (brief 14). The shell imports exactly these names:
//   <KeysProvider>       around the shell
//   <ShortcutsHost />    once
//   <HelpSheet />        once
//   useHelpSheet()       { isOpen, open(), close() } (the top bar's help button calls open)

export { KeysProvider, useHelpSheet, type HelpSheetApi } from "./helpSheet";
export { HelpSheet } from "./HelpSheet";
export { ShortcutsHost } from "./ShortcutsHost";
