// Postern's filters as Sieve: the model, the generator and a parser for
// exactly what the generator writes. Pure: no network, no DOM.

export {
  POSTERN_SCRIPT_NAME,
  GENERATED_MARKER,
  SCRIPT_FORMAT,
  VACATION_SCRIPT_NAME,
  MAX_SIZE_AMOUNT,
  emptyCriteria,
  emptyActions,
  emptyFilterSet,
  isGenerated,
  cleanText,
  splitList,
  splitWords,
  joinWords,
  isAddress,
  normalizeAddress,
  normalizeFilter,
  normalizeFilterSet,
  hasCriteria,
  hasActions,
  filterProblems,
  isIncludableName,
  withBlocked,
  withoutBlocked,
  type MailFilter,
  type FilterActions,
  type FilterCriteria,
  type FilterLabel,
  type FilterSet,
  type SizeCriterion,
} from "./model.js";
export { generateSieve, stateVariables, FALLBACK_NAMES, SPAM_PERCENT } from "./generate.js";
export { parseFilterScript, FilterScriptParseError } from "./parse.js";
export { quoteSieve, decodeSieveText, SieveStringError, type QuotedString } from "./escape.js";
export { tokenize as tokenizeSieve, parseSyntax as parseSieveSyntax, SieveSyntaxError } from "./syntax.js";
