// Reads back a script ./generate wrote, and nothing else: anything outside
// that layout is an error, so Postern never claims to understand a script it
// would then rewrite differently. Whitespace and comments are free.

import { decodeSieveText, DOLLAR_VARIABLE, SieveStringError } from "./escape.js";
import { SPAM_PERCENT, VAR } from "./generate.js";
import {
  emptyActions,
  emptyCriteria,
  GENERATED_MARKER,
  isGenerated,
  SCRIPT_FORMAT,
  type MailFilter,
  type FilterCriteria,
  type FilterSet,
} from "./model.js";
import { parseSyntax, SieveSyntaxError, type Argument, type Command, type Test } from "./syntax.js";

/** The script is not one Postern wrote, or was changed by hand. */
export class FilterScriptParseError extends Error {
  readonly line: number | null;
  constructor(message: string, line: number | null = null) {
    super(line ? `Line ${line}: ${message}` : message);
    this.name = "FilterScriptParseError";
    this.line = line;
  }
}

function fail(message: string, at?: { line: number }): never {
  throw new FilterScriptParseError(message, at?.line ?? null);
}

/** A person's text from a string token. */
function text(raw: string, at: { line: number }): string {
  try {
    return decodeSieveText(raw);
  } catch (e) {
    if (e instanceof SieveStringError) fail(e.message, at);
    throw e;
  }
}

/** The arguments' shape as a short signature, e.g. `:contains "s" [..]`, to compare with what Postern writes. */
function shape(args: readonly Argument[]): string {
  return args.map((a) => (a.kind === "tag" ? `:${a.name}` : a.kind === "number" ? "N" : a.kind === "string" ? "S" : "L")).join(" ");
}

function strings(arg: Argument | undefined, at: { line: number }): string[] {
  if (arg?.kind === "string") return [text(arg.raw, at)];
  if (arg?.kind === "list") return arg.raws.map((r) => text(r, at));
  return fail("Expected a string or a string list.", at);
}

function rawIs(arg: Argument | undefined, ...values: string[]): boolean {
  if (arg?.kind === "string") return values.length === 1 && arg.raw.toLowerCase() === values[0]!.toLowerCase();
  if (arg?.kind === "list") return arg.raws.length === values.length && arg.raws.every((r, i) => r.toLowerCase() === values[i]!.toLowerCase());
  return false;
}

/** `string :is "${name}" "1"`, or `not` of it; returns the variable name. */
function setTest(test: Test | undefined): { name: string; negated: boolean } | null {
  if (!test) return null;
  if (test.name === "not" && test.args.length === 0 && test.tests.length === 1) {
    const inner = setTest(test.tests[0]);
    return inner && !inner.negated ? { name: inner.name, negated: true } : null;
  }
  if (test.name !== "string" || shape(test.args) !== ":is S S" || test.tests.length > 0) return null;
  const [, v, one] = test.args as [Argument, { raw: string }, { raw: string }];
  const m = /^\$\{([a-z0-9_]+)\}$/.exec(v.raw);
  return m && one.raw === "1" ? { name: m[1]!, negated: false } : null;
}

// ---- Criteria --------------------------------------------------------------

function readCriterion(test: Test, c: FilterCriteria, seen: Set<string>): void {
  const once = (key: string) => {
    if (seen.has(key)) fail(`The filter tests ${key} twice.`, test);
    seen.add(key);
  };
  const sig = shape(test.args);
  if (test.name === "header" && sig === ":contains S L" && test.tests.length === 0 && rawIs(test.args[1], "from")) {
    once("from");
    c.from = strings(test.args[2], test);
    return;
  }
  if (test.name === "header" && (sig === ":contains L L" || sig === ":contains L S") && rawIs(test.args[1], "to", "cc")) {
    once("to");
    c.to = strings(test.args[2], test);
    return;
  }
  if (test.name === "header" && sig === ":contains S S" && rawIs(test.args[1], "subject")) {
    once("subject");
    c.subject = text((test.args[2] as { raw: string }).raw, test);
    return;
  }
  if (test.name === "header" && sig === ":mime :anychild :contains S S" && rawIs(test.args[3], "content-disposition") && rawIs(test.args[4], "attachment")) {
    once("attachment");
    c.hasAttachment = true;
    return;
  }
  if (test.name === "size" && (sig === ":over N" || sig === ":under N")) {
    once("size");
    const n = test.args[1] as { value: number; unit: string };
    if (n.unit === "G") fail("A size in G, which Postern never writes.", test);
    c.size = { comparison: sig === ":over N" ? "larger" : "smaller", amount: n.value, unit: n.unit === "" ? "B" : (n.unit as "K" | "M") };
    return;
  }
  // anyof (header :contains "subject" W, body :text :contains W): one of "has the words".
  if (test.name === "anyof" && test.args.length === 0 && test.tests.length === 2) {
    const [h, b] = test.tests as [Test, Test];
    if (
      h.name === "header" &&
      shape(h.args) === ":contains S S" &&
      rawIs(h.args[1], "subject") &&
      b.name === "body" &&
      shape(b.args) === ":text :contains S" &&
      (h.args[2] as { raw: string }).raw === (b.args[2] as { raw: string }).raw
    ) {
      const word = text((h.args[2] as { raw: string }).raw, h);
      if (c.words.includes(word)) fail(`The filter tests the word ${JSON.stringify(word)} twice.`, test);
      c.words.push(word);
      return;
    }
  }
  // not anyof (header :contains "subject" L, body :text :contains L): "doesn't have".
  if (test.name === "not" && test.args.length === 0 && test.tests.length === 1) {
    const inner = test.tests[0]!;
    if (inner.name === "anyof" && inner.args.length === 0 && inner.tests.length === 2) {
      const [h, b] = inner.tests as [Test, Test];
      const hs = shape(h.args);
      if (
        h.name === "header" &&
        (hs === ":contains S L" || hs === ":contains S S") &&
        rawIs(h.args[1], "subject") &&
        b.name === "body" &&
        shape(b.args) === `:text ${hs.replace("S ", "")}` &&
        JSON.stringify(strings(h.args[2], h)) === JSON.stringify(strings(b.args[2], b))
      ) {
        once("doesn't have");
        c.notWords = strings(h.args[2], h);
        return;
      }
    }
  }
  fail(`A test Postern doesn't write (${test.name}).`, test);
}

function readCriteria(test: Test | undefined, at: { line: number }): FilterCriteria {
  if (!test || test.name !== "allof" || test.args.length > 0 || test.tests.length === 0) {
    return fail("A filter's test should be allof (...).", test ?? at);
  }
  const c = emptyCriteria();
  const seen = new Set<string>();
  for (const t of test.tests) readCriterion(t, c, seen);
  return c;
}

// ---- The script -------------------------------------------------------------

interface PendingFilter {
  filter: MailFilter;
  /** Variables its block sets: label / forward wait for the delivery part. */
  wantsLabel: boolean;
  wantsForward: boolean;
}

/** `if allof (...) { addflag ...; set ...; }`: the delivery part's `if allof` holds keep and stop instead. */
function isFilterBlock(cmd: Command): boolean {
  const block = cmd.block ?? [];
  return cmd.name === "if" && cmd.tests[0]?.name === "allof" && block.length > 0 && block.every((c) => c.name === "addflag" || c.name === "set");
}

function readFilterBlock(cmd: Command, n: number): PendingFilter {
  const filter: MailFilter = { criteria: readCriteria(cmd.tests[0], cmd), actions: emptyActions() };
  const a = filter.actions;
  let wantsLabel = false;
  let wantsForward = false;
  const seen = new Set<string>();
  for (const s of cmd.block ?? []) {
    const key = `${s.name} ${s.args.map((x) => (x.kind === "string" ? x.raw : "?")).join(" ")}`;
    if (seen.has(key)) fail("A filter does the same thing twice.", s);
    seen.add(key);
    if (s.name === "addflag" && shape(s.args) === "S" && s.block === null && s.tests.length === 0) {
      const flag = (s.args[0] as { raw: string }).raw;
      if (flag === "\\Seen") a.markRead = true;
      else if (flag === "\\Flagged") a.star = true;
      else fail(`A flag Postern doesn't set (${flag}).`, s);
      continue;
    }
    if (s.name === "set" && shape(s.args) === "S S" && s.block === null && (s.args[1] as { raw: string }).raw === "1") {
      const name = (s.args[0] as { raw: string }).raw;
      if (name === VAR.skip) a.archive = true;
      else if (name === VAR.nospam) a.neverSpam = true;
      else if (name === VAR.delete) a.delete = true;
      else if (name === VAR.label(n)) wantsLabel = true;
      else if (name === VAR.forward(n)) wantsForward = true;
      else fail(`A variable Postern doesn't set here (${name}).`, s);
      continue;
    }
    fail(`A command Postern doesn't write in a filter (${s.name}).`, s);
  }
  return { filter, wantsLabel, wantsForward };
}

/** Is it exactly `fileinto [:flags "$junk"] :specialuse "<use>" "<name>"` (any fallback name)? */
function isSpecialFileinto(cmd: Command | undefined, use: string, flags: string | null): boolean {
  if (!cmd || cmd.name !== "fileinto" || cmd.block !== null || cmd.tests.length > 0) return false;
  const expected = flags === null ? ":specialuse S S" : ":flags S :specialuse S S";
  if (shape(cmd.args) !== expected) return false;
  const args = cmd.args as { raw: string }[];
  if (flags !== null && args[1]!.raw !== flags) return false;
  return args[flags === null ? 1 : 3]!.raw === use;
}

function isPlain(cmd: Command | undefined, name: string): boolean {
  return !!cmd && cmd.name === name && cmd.args.length === 0 && cmd.tests.length === 0 && cmd.block === null;
}

function blockIs(cmd: Command, ...checks: ((c: Command | undefined) => boolean)[]): boolean {
  const b = cmd.block ?? [];
  return b.length === checks.length && checks.every((check, i) => check(b[i]));
}

/**
 * Read a script Postern wrote back into its filter set.
 * @throws FilterScriptParseError when the script is not in Postern's layout.
 */
export function parseFilterScript(source: string): FilterSet {
  if (!isGenerated(source)) fail(`The script doesn't start with "${GENERATED_MARKER}".`);
  const format = /^# Postern filters, format (\d+)\s*$/m.exec(source);
  if (!format || Number(format[1]) !== SCRIPT_FORMAT) fail(`The script isn't in Postern's filter format ${SCRIPT_FORMAT}.`);

  let commands: Command[];
  try {
    commands = parseSyntax(source);
  } catch (e) {
    if (e instanceof SieveSyntaxError) throw new FilterScriptParseError(e.message.replace(/^Line \d+: /, ""), e.line || null);
    throw e;
  }

  const set: FilterSet = { filters: [], blocked: [], includes: [] };
  let i = 0;
  const at = () => commands[i];

  // require [...];
  if (at()?.name === "require") {
    const r = at()!;
    if (r.block !== null || r.tests.length > 0 || r.args.length !== 1 || (r.args[0]!.kind !== "list" && r.args[0]!.kind !== "string")) fail("A malformed require.", r);
    i++;
  }

  // State: set "postern_..." ""; and set "postern_dollar" "$";
  const declared = new Set<string>();
  while (at()?.name === "set" && at()!.block === null) {
    const s = at()!;
    const name = shape(s.args) === "S S" ? (s.args[0] as { raw: string }).raw : "";
    const value = shape(s.args) === "S S" ? (s.args[1] as { raw: string }).raw : null;
    const ok = (name === DOLLAR_VARIABLE && value === "$") || (/^postern_[a-z0-9_]+$/.test(name) && name !== DOLLAR_VARIABLE && value === "");
    if (!ok || declared.has(name)) fail("A state variable Postern doesn't write.", s);
    declared.add(name);
    i++;
  }

  // Blocked senders.
  const blocked = at();
  if (
    blocked &&
    blocked.name === "if" &&
    blocked.tests[0]?.name === "address" &&
    shape(blocked.tests[0].args) === ":is S L" &&
    rawIs(blocked.tests[0].args[1], "from")
  ) {
    if (!blockIs(blocked, (c) => isSpecialFileinto(c, "\\Junk", "$junk"), (c) => isPlain(c, "stop"))) fail("The blocked senders rule was changed.", blocked);
    set.blocked = strings(blocked.tests[0].args[2], blocked);
    i++;
  }

  // Filters.
  const pending: PendingFilter[] = [];
  while (at() && isFilterBlock(at()!)) {
    pending.push(readFilterBlock(at()!, pending.length + 1));
    i++;
  }
  if (pending.length > 0 && !declared.has(VAR.skip)) fail("The filters' state variables are missing.");

  // Delivery.
  const labels = new Map<number, { id: string; name: string }>();
  const forwards = new Map<number, string>();
  let sawFinal = false;
  let sawSpam = false;
  while (at() && at()!.name === "if" && !sawFinal) {
    const cmd = at()!;
    const cond = cmd.tests[0];
    const v = setTest(cond);
    if (v && !v.negated && v.name === VAR.delete) {
      if (!blockIs(cmd, (c) => isSpecialFileinto(c, "\\Trash", null), (c) => isPlain(c, "stop"))) fail("The delete rule was changed.", cmd);
    } else if (cond?.name === "allof" && cond.tests.length === 2 && setTest(cond.tests[0])?.name === VAR.nospam && setTest(cond.tests[0])?.negated) {
      const spam = cond.tests[1]!;
      const ok =
        spam.name === "spamtest" &&
        shape(spam.args) === ":percent :value S :comparator S S" &&
        (spam.args[2] as { raw: string }).raw === "ge" &&
        (spam.args[4] as { raw: string }).raw === "i;ascii-numeric" &&
        (spam.args[5] as { raw: string }).raw === String(SPAM_PERCENT);
      if (!ok || !blockIs(cmd, (c) => isPlain(c, "keep"), (c) => isPlain(c, "stop"))) fail("The spam rule was changed.", cmd);
      sawSpam = true;
    } else if (v && !v.negated && /^postern_label_\d+$/.test(v.name)) {
      const n = Number(v.name.slice("postern_label_".length));
      const b = cmd.block ?? [];
      const f = b[0];
      if (
        b.length !== 2 ||
        !f ||
        f.name !== "fileinto" ||
        shape(f.args) !== ":mailboxid S S" ||
        b[1]!.name !== "set" ||
        shape(b[1]!.args) !== "S S" ||
        (b[1]!.args[0] as { raw: string }).raw !== VAR.filed ||
        (b[1]!.args[1] as { raw: string }).raw !== "1"
      ) {
        fail("A label rule was changed.", cmd);
      }
      if (labels.has(n)) fail(`Filter ${n} has two label rules.`, cmd);
      labels.set(n, { id: text((f.args[1] as { raw: string }).raw, f), name: text((f.args[2] as { raw: string }).raw, f) });
    } else if (v && !v.negated && /^postern_forward_\d+$/.test(v.name)) {
      const n = Number(v.name.slice("postern_forward_".length));
      const b = cmd.block ?? [];
      const r = b[0];
      if (b.length !== 1 || !r || r.name !== "redirect" || shape(r.args) !== ":copy S" || r.tests.length > 0) fail("A forwarding rule was changed.", cmd);
      if (forwards.has(n)) fail(`Filter ${n} has two forwarding rules.`, cmd);
      forwards.set(n, text((r.args[1] as { raw: string }).raw, r));
    } else if (v && !v.negated && v.name === VAR.skip) {
      // if skip { if not filed { All Mail } } elsif nospam { Inbox } elsif filed { keep }
      const inner = (cmd.block ?? [])[0];
      const innerOk = inner && (cmd.block ?? []).length === 1 && inner.name === "if" && setTest(inner.tests[0])?.name === VAR.filed && setTest(inner.tests[0])?.negated && blockIs(inner, (c) => isSpecialFileinto(c, "\\Archive", null));
      const e1 = commands[i + 1];
      const e2 = commands[i + 2];
      const e1v = setTest(e1?.tests[0]);
      const e2v = setTest(e2?.tests[0]);
      if (
        !innerOk ||
        e1?.name !== "elsif" ||
        e1v?.name !== VAR.nospam ||
        e1v.negated ||
        !blockIs(e1, (c) => isSpecialFileinto(c, "\\Inbox", null)) ||
        e2?.name !== "elsif" ||
        e2v?.name !== VAR.filed ||
        e2v.negated ||
        !blockIs(e2, (c) => isPlain(c, "keep"))
      ) {
        fail("The final delivery rule was changed.", cmd);
      }
      i += 2;
      sawFinal = true;
    } else {
      fail("A rule Postern doesn't write.", cmd);
    }
    i++;
  }
  if (pending.length > 0 && (!sawFinal || !sawSpam)) fail("The delivery rules are missing.");
  if (pending.length === 0 && (labels.size > 0 || forwards.size > 0 || sawFinal)) fail("Delivery rules without filters.");

  // include :personal :optional "name";
  while (at()?.name === "include") {
    const inc = at()!;
    if (inc.block !== null || inc.tests.length > 0 || shape(inc.args) !== ":personal :optional S") fail("An include Postern doesn't write.", inc);
    const name = text((inc.args[2] as { raw: string }).raw, inc);
    if (set.includes.includes(name)) fail(`The script includes ${JSON.stringify(name)} twice.`, inc);
    set.includes.push(name);
    i++;
  }
  if (i < commands.length) fail(`A command Postern doesn't write here (${commands[i]!.name}).`, commands[i]);

  pending.forEach((p, index) => {
    const n = index + 1;
    if (p.wantsLabel) {
      const label = labels.get(n);
      if (!label) fail(`Filter ${n} applies a label but has no label rule.`);
      p.filter.actions.label = label!;
      labels.delete(n);
    }
    if (p.wantsForward) {
      const to = forwards.get(n);
      if (to === undefined) fail(`Filter ${n} forwards but has no forwarding rule.`);
      p.filter.actions.forwardTo = to!;
      forwards.delete(n);
    }
    set.filters.push(p.filter);
  });
  if (labels.size > 0 || forwards.size > 0) fail("A label or forwarding rule belongs to no filter.");
  return set;
}
