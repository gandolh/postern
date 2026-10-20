// The layout's breakpoints as media queries (brief 05), in a module of their
// own so the mobile pieces (brief 16) can read them without importing Shell.
// CSS repeats the same values: phones are under 37.4375rem (600 px).

/** Wide screens show the full navigation; narrower ones a rail of icons; phones none until opened. */
export const WIDE_QUERY = "(min-width: 64rem)";
export const PHONE_QUERY = "(max-width: 37.4375rem)";
