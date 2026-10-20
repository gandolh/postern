// Brief 14's `/` shortcut: focus the search box from anywhere.
//
//   import { focusSearch } from "../search";
//   focusSearch();   // true if the box is on screen and took focus

let input: HTMLInputElement | null = null;

/** The search box registers its input here while mounted. */
export function registerSearchInput(el: HTMLInputElement | null): void {
  input = el;
}

export function focusSearch(): boolean {
  if (!input || !input.isConnected) return false;
  input.focus();
  input.select();
  return true;
}
