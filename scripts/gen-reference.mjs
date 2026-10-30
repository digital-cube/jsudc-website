#!/usr/bin/env node
/**
 *   node scripts/gen-reference.mjs        (npm run gen; build, dev and check run it first)
 *
 * The Reference section, generated from the installed @jsudc/core so it cannot
 * drift from the package: every page under src/content/docs/reference/ is
 * written here, from
 *
 *   - the package's exported Zod schemas, walked through their definitions
 *     (keys, types, optional / default, the constraints z.toJSONSchema reports);
 *   - the JSDoc the package ships in dist/*.js above each schema and each key,
 *     and the messages of its refinements (the rules checked at load);
 *   - its registries and tables: ACTIONS, SUPPORTED_OPS and the `filter`
 *     builders, filterableForType, FIELD_TYPES, RENDERER_NAMES, SOURCE_KINDS.
 *
 * Nothing here restates a key by hand: bump @jsudc/core and the pages follow.
 * The generated directory is git-ignored; each page says which version it was
 * generated from.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@jsudc/core";
import corePkg from "@jsudc/core/package.json" with { type: "json" };
import GithubSlugger from "github-slugger";
import ts from "typescript";
import { z } from "zod";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "content", "docs", "reference");
const DIST = dirname(fileURLToPath(import.meta.resolve("@jsudc/core")));
const VERSION = corePkg.version;
const REPO = "https://github.com/digital-cube/jsudc-core";

const isSchema = (v) => Boolean(v && typeof v === "object" && v._zod?.def);

/** Every export of the package by name (the walk looks schemas up by the names it finds). */
const EXPORTS = new Map(Object.entries(core));

/** Schema instance → its export name. Only exported schemas get a section and a link. */
const NAMES = new Map();
for (const [name, value] of EXPORTS) {
  if (isSchema(value) && name.endsWith("Schema")) NAMES.set(value, name);
}
const title = (name) => name.replace(/Schema$/, "");

// --- JSDoc and refinement messages from dist/*.js ------------------------------

const OBJECT_CALLS = new Set(["object", "looseObject", "strictObject"]);

function isObjectCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    OBJECT_CALLS.has(node.expression.name.text) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "z" &&
    node.arguments[0] !== undefined &&
    ts.isObjectLiteralExpression(node.arguments[0])
  );
}

/** The object literal of the first `z.object(…)` (or loose / strict) in source order. */
function firstObjectLiteral(node) {
  let found;
  const visit = (n) => {
    if (found) return;
    if (isObjectCall(n)) found = n.arguments[0];
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function jsdoc(text, node) {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  const doc = ranges.filter((r) => text.startsWith("/**", r.pos)).at(-1);
  if (!doc) return "";
  return text
    .slice(doc.pos + 3, doc.end - 2)
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function propName(prop) {
  const n = prop.name;
  return n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : undefined;
}

/** `prefix + key` → JSDoc of every key, nested objects as `outer.inner`. */
function collectProps(text, literal, prefix, into) {
  for (const prop of literal.properties) {
    const key = ts.isPropertyAssignment(prop) ? propName(prop) : undefined;
    if (!key) continue;
    const doc = jsdoc(text, prop);
    if (doc) into.set(prefix + key, doc);
    const nested = firstObjectLiteral(prop.initializer);
    if (nested) collectProps(text, nested, `${prefix}${key}.`, into);
  }
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.getText().slice(1, -1);
  return undefined;
}

/** `{path: ["a", …], message: "…"}` of every `ctx.addIssue(…)` and `.refine(fn, {…})`. */
function collectRules(node) {
  const rules = [];
  const fromLiteral = (lit) => {
    let path = "";
    let message;
    for (const p of lit.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const key = propName(p);
      if (key === "message") message = literalText(p.initializer);
      if (key === "path" && ts.isArrayLiteralExpression(p.initializer)) {
        path = p.initializer.elements
          .map((e) => (ts.isStringLiteral(e) ? e.text : "[…]"))
          .join(".");
      }
    }
    if (message) rules.push({ path, message });
  };
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const callee = n.expression.name.text;
      const arg =
        callee === "addIssue" ? n.arguments[0] : callee === "refine" ? n.arguments[1] : undefined;
      if (arg && ts.isObjectLiteralExpression(arg)) fromLiteral(arg);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return rules;
}

/** Export name → {doc, props: Map(key path → doc), rules}. */
async function readDocs() {
  const docs = new Map();
  for (const file of (await readdir(DIST)).filter((f) => f.endsWith(".js"))) {
    const text = await readFile(join(DIST, file), "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const decl of st.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const props = new Map();
        const literal = firstObjectLiteral(decl.initializer);
        if (literal) collectProps(text, literal, "", props);
        docs.set(decl.name.text, {
          doc: jsdoc(text, st),
          props,
          rules: collectRules(decl.initializer),
          file,
        });
      }
    }
  }
  return docs;
}

const DOCS = await readDocs();

// --- markdown helpers ----------------------------------------------------------------

/** Text for MDX: JSX braces and angle brackets outside `code` become entities. */
function prose(text) {
  return text
    .split(/(`[^`]*`)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\{/g, "&#123;")
            .replace(/\}/g, "&#125;"),
    )
    .join("");
}

const cell = (text) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
const code = (text) => `\`${String(text).replace(/`/g, "'")}\``;
const json = (value) => {
  if (typeof value === "function") return "computed";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

function table(head, rows) {
  if (!rows.length) return "";
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
    "",
  ].join("\n");
}

// --- walking a schema -------------------------------------------------------------------

/**
 * Peel the wrappers that do not change what one writes: optional, nullable,
 * default / prefault, lazy, and a pipe (its input side; a preprocess's target).
 * Stops at an exported schema unless it is `self`.
 */
function unwrap(schema, self) {
  const flags = { optional: false, nullable: false, hasDefault: false, default: undefined };
  let s = schema;
  for (;;) {
    if (s !== self && NAMES.has(s)) break;
    const d = s._zod.def;
    if (d.type === "optional") {
      flags.optional = true;
      s = d.innerType;
    } else if (d.type === "nullable") {
      flags.nullable = true;
      s = d.innerType;
    } else if (d.type === "default" || d.type === "prefault") {
      flags.hasDefault = true;
      flags.default = d.defaultValue;
      s = d.innerType;
    } else if (d.type === "readonly" || d.type === "catch") {
      s = d.innerType;
    } else if (d.type === "lazy") {
      s = d.getter();
    } else if (d.type === "pipe") {
      s = d.in._zod.def.type === "transform" ? d.out : d.in;
    } else break;
    self = undefined;
  }
  return { schema: s, ...flags };
}

/** min / max / pattern / format, as z.toJSONSchema reports them for a leaf. */
function constraints(schema) {
  const type = schema._zod.def.type;
  if (!["string", "number", "int", "array", "record", "bigint"].includes(type)) return [];
  let js;
  try {
    js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  } catch {
    return [];
  }
  const out = [];
  if (js.format) out.push(js.format);
  if (js.pattern) out.push(`matches ${code(js.pattern)}`);
  for (const [key, label] of [
    ["minLength", "min length"],
    ["maxLength", "max length"],
    ["minItems", "min items"],
    ["maxItems", "max items"],
    ["minimum", "≥"],
    ["exclusiveMinimum", "&gt;"],
    ["maximum", "≤"],
    ["exclusiveMaximum", "&lt;"],
  ]) {
    if (js[key] === undefined) continue;
    // z.int() reports the safe-integer range; it says nothing a reader needs.
    if (Math.abs(js[key]) === Number.MAX_SAFE_INTEGER) continue;
    out.push(`${label} ${js[key]}`);
  }
  return out;
}

/**
 * One page being written: its sections in order, and the inline (unexported)
 * objects and unowned exported schemas it found on the way.
 */
class Page {
  constructor(slug) {
    this.slug = slug;
    this.slugger = new GithubSlugger();
    this.parts = [];
    this.done = new Set();
    this.queue = [];
  }

  anchor(heading) {
    return this.slugger.slug(heading);
  }
}

/** Export name → the page slug that holds its section. */
const OWNER = new Map();

function linkTo(page, name) {
  const t = title(name);
  if (!OWNER.has(name)) {
    OWNER.set(name, page.slug);
    page.queue.push({ name });
  }
  const anchor = new GithubSlugger().slug(t);
  const owner = OWNER.get(name);
  return owner === page.slug ? `[${t}](#${anchor})` : `[${t}](/reference/${owner}/#${anchor})`;
}

/**
 * The type of `schema` as one line of markdown. An exported schema is a link to
 * its section; an inline object becomes a subsection `ctx.path` of this page.
 */
function typeText(schema, page, ctx, names = {}) {
  const u = unwrap(schema);
  const s = u.schema;
  const name = NAMES.get(s);
  let text;
  if (name && names[name]) text = names[name];
  else if (name) text = linkTo(page, name);
  else {
    const d = s._zod.def;
    switch (d.type) {
      case "object": {
        page.queue.push({
          inline: s,
          path: ctx.path,
          docOwner: ctx.docOwner,
          docPrefix: ctx.docPrefix,
        });
        text = `[object](#${new GithubSlugger().slug(ctx.path)})`;
        break;
      }
      case "array": {
        const inner = typeText(d.element, page, ctx, names);
        text = inner.includes(" | ") ? `(${inner})[]` : `${inner}[]`;
        break;
      }
      case "tuple":
        text = `[${d.items.map((i) => typeText(i, page, ctx, names)).join(", ")}]`;
        break;
      case "union":
        text = d.options
          .map((o, i) =>
            typeText(
              o,
              page,
              {
                ...ctx,
                path: d.options.length > 1 ? `${ctx.path} (${memberLabel(d, o, i)})` : ctx.path,
              },
              names,
            ),
          )
          .join(" | ");
        break;
      case "record":
        text = `Record&lt;${typeText(d.keyType, page, ctx, names)}, ${typeText(d.valueType, page, ctx, names)}&gt;`;
        break;
      case "enum":
        text = Object.values(d.entries)
          .map((v) => code(json(v)))
          .join(" | ");
        break;
      case "literal":
        text = d.values.map((v) => code(json(v))).join(" | ");
        break;
      case "number":
        text = z.toJSONSchema(s, { io: "input" }).type === "integer" ? "integer" : "number";
        break;
      case "unknown":
      case "any":
        text = "any";
        break;
      default:
        text = d.type;
    }
  }
  return u.nullable ? `${text} | null` : text;
}

function catchallNote(s) {
  const c = s._zod.def.catchall?._zod.def.type;
  if (c === "never") return "No other keys: an unknown key is an error.";
  if (c === "unknown")
    return "Loose: other keys parse and are kept, so a dclabs file with keys jsudc does not read still loads.";
  return "Unknown keys are dropped.";
}

function rulesBlock(name) {
  const rules = DOCS.get(name)?.rules ?? [];
  if (!rules.length) return "";
  return [
    "Checked at load:",
    "",
    ...rules.map((r) => `- ${r.path ? `${code(r.path)}: ` : ""}${prose(r.message)}`),
    "",
  ].join("\n");
}

function objectTable(s, page, docOwner, docPrefix, path) {
  const shape = s._zod.def.shape;
  const props = DOCS.get(docOwner)?.props ?? new Map();
  const rows = Object.entries(shape).map(([key, field]) => {
    const u = unwrap(field);
    const type = typeText(field, page, {
      path: `${path}.${key}`,
      docOwner,
      docPrefix: `${docPrefix}${key}.`,
    });
    const notes = [prose(props.get(docPrefix + key) ?? ""), ...constraints(u.schema)].filter(
      Boolean,
    );
    return [
      code(key),
      type,
      u.optional || u.hasDefault ? "" : "yes",
      u.hasDefault ? code(json(u.default)) : "",
      notes.join(" · "),
    ];
  });
  if (!rows.length) return "No keys.\n";
  return table(["Key", "Type", "Required", "Default", "Notes"], rows);
}

/** What tells one member of a union apart: its discriminator value, its one key, or its place. */
function memberLabel(union, option, i) {
  const s = unwrap(option).schema;
  const named = NAMES.get(s);
  if (named) return title(named);
  const shape = s._zod.def.shape;
  const disc = union.discriminator && shape?.[union.discriminator];
  if (disc) return `${union.discriminator}: ${json(unwrap(disc).schema._zod.def.values?.[0])}`;
  if (shape && Object.keys(shape).length === 1) return Object.keys(shape)[0];
  return String(i + 1);
}

/** The body of a section: a key table, a list of values, or a type line. */
function body(s, page, docOwner, path) {
  const d = s._zod.def;
  if (d.type === "object")
    return [objectTable(s, page, docOwner, "", path), catchallNote(s), ""].join("\n");
  if (d.type === "enum") {
    return `One of: ${Object.values(d.entries)
      .map((v) => code(json(v)))
      .join(", ")}.\n`;
  }
  if (d.type === "union") {
    const lines = d.options.map((o, i) => {
      const label = memberLabel(d, o, i);
      const type = typeText(o, page, { path: `${path} (${label})`, docOwner, docPrefix: "" });
      return NAMES.has(unwrap(o).schema) || !/^\d+$/.test(label)
        ? `- ${code(label)}: ${type}`
        : `- ${type}`;
    });
    return [
      d.discriminator ? `One of, told apart by ${code(d.discriminator)}:` : "One of:",
      "",
      ...lines,
      "",
    ].join("\n");
  }
  return `Type: ${typeText(s, page, { path, docOwner, docPrefix: "" })}.\n`;
}

/** `## Name` for an exported schema, with its JSDoc, body and rules. */
function section(page, name, level = 2) {
  if (page.done.has(name)) return;
  page.done.add(name);
  const schema = EXPORTS.get(name);
  const t = title(name);
  const out = [`${"#".repeat(level)} ${t}`, ""];
  const doc = DOCS.get(name)?.doc;
  if (doc) out.push(prose(doc), "");
  const s = unwrap(schema, schema).schema;
  out.push(body(s, page, name, t));
  const rules = rulesBlock(name);
  if (rules) out.push(rules);
  page.anchor(t);
  page.parts.push(out.join("\n"));
  drain(page, level);
}

/** Write what the last section queued: its inline objects, then unowned schemas it named. */
function drain(page, level) {
  while (page.queue.length) {
    const item = page.queue.shift();
    if (item.name) {
      section(page, item.name, level);
      continue;
    }
    const key = `inline:${item.path}`;
    if (page.done.has(key)) continue;
    page.done.add(key);
    const out = [`${"#".repeat(Math.min(level + 1, 4))} ${item.path}`, ""];
    const s = item.inline;
    out.push(
      objectTable(s, page, item.docOwner, item.docPrefix ?? "", item.path),
      catchallNote(s),
      "",
    );
    page.anchor(item.path);
    page.parts.push(out.join("\n"));
  }
}

// --- pages ------------------------------------------------------------------------------

const banner = (file) =>
  [
    `:::note[Generated from @jsudc/core ${VERSION}]`,
    `Every table on this page is read from the Zod schemas and the doc comments of`,
    `[\`@jsudc/core\` ${VERSION}](https://www.npmjs.com/package/@jsudc/core/v/${VERSION})${
      file
        ? ` (${file.map((f) => `[\`src/${f.replace(/\.js$/, ".ts")}\`](${REPO}/blob/v${VERSION}/src/${f.replace(/\.js$/, ".ts")})`).join(", ")})`
        : ""
    } by \`scripts/gen-reference.mjs\` at build time; it changes when the package does.`,
    ":::",
    "",
  ].join("\n");

const files = (...names) => [...new Set(names.map((n) => DOCS.get(n)?.file).filter(Boolean))];

const actionSlug = (action) => `actions/${action.replace(/\./g, "-")}`;

const PAGES = [];

PAGES.push({
  slug: "envelope",
  title: "Envelope and errors",
  description:
    "The message every UDC request and response travels in, the error payload and the row shape.",
  order: 1,
  schemas: [
    "UdcMessageSchema",
    "ErrorPayloadSchema",
    "ErrorCodeSchema",
    "RowSchema",
    "RowMetaSchema",
    "CapabilitiesSchema",
  ],
  intro: (page) => {
    const rows = core.ACTION_NAMES.map((a) => [
      `[${code(a)}](/reference/${actionSlug(a)}/)`,
      code(core.requestKind(a)),
      code(core.okKind(a)),
      code(core.errKind(a)),
    ]);
    page.anchor("Kinds");
    return [
      "## Kinds",
      "",
      `A request's \`kind\` is \`${core.KIND_PREFIX}<action>\`; its answer carries the same \`id\` and the kind`,
      "with `.ok` (the response payload) or `.err` (an error payload) appended.",
      "",
      table(["Action", "Request", "Success", "Error"], rows),
    ].join("\n");
  },
});

core.ACTION_NAMES.forEach((action, i) => {
  const { request, response } = core.ACTIONS[action];
  const reqName = NAMES.get(request);
  const resName = NAMES.get(response);
  PAGES.push({
    slug: actionSlug(action),
    title: core.requestKind(action),
    description: `The ${action} action of the UDC protocol: its request and response payloads.`,
    order: 10 + i,
    schemas: [reqName, resName].filter(Boolean),
    files: files(reqName, resName),
    intro: (page) => {
      page.anchor("Messages");
      const doc = DOCS.get(reqName)?.doc;
      return [
        doc ? `${prose(doc)}\n` : "",
        "## Messages",
        "",
        table(
          ["Direction", "Kind", "Payload"],
          [
            [
              "request",
              code(core.requestKind(action)),
              reqName ? `[${title(reqName)}](#${new GithubSlugger().slug(title(reqName))})` : "—",
            ],
            [
              "success",
              code(core.okKind(action)),
              resName ? `[${title(resName)}](#${new GithubSlugger().slug(title(resName))})` : "—",
            ],
            [
              "error",
              code(core.errKind(action)),
              "[ErrorPayload](/reference/envelope/#errorpayload)",
            ],
          ],
        ),
        "Over HTTP the request payload is the body of `POST /udc/" +
          action +
          "` and the answer is the response payload (or the error payload with a 4xx/5xx status).",
        "",
      ].join("\n");
    },
  });
});

PAGES.push({
  slug: "filter",
  title: "Filter DSL",
  description:
    "The grammar of a UDC filter, its operators and the operators each field type allows.",
  order: 2,
  schemas: [
    "FilterNodeSchema",
    "ConditionSchema",
    "FilterOpSchema",
    "SortKeySchema",
    "PageRequestSchema",
  ],
  intro: (page) => {
    const union = unwrap(core.FilterNodeSchema, core.FilterNodeSchema).schema._zod.def.options;
    const names = { FilterNodeSchema: "node", FilterOpSchema: "op", ConditionSchema: "condition" };
    const alts = [];
    const rules = [];
    for (const option of union) {
      const s = unwrap(option).schema;
      const shape = s._zod.def.shape;
      const keys = Object.keys(shape);
      const strict = s._zod.def.catchall?._zod.def.type === "never";
      const rule = NAMES.has(option)
        ? (names[NAMES.get(option)] ?? title(NAMES.get(option)))
        : strict && keys.length === 1
          ? keys[0]
          : `group${alts.length}`;
      alts.push(rule);
      const plain = (f) =>
        typeText(f, new Page("filter-grammar"), { path: rule, docOwner: "", docPrefix: "" }, names)
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/`/g, "");
      const body = keys.map((k) => {
        const u = unwrap(shape[k]);
        return `"${k}"${u.optional || u.hasDefault ? "?" : ""}: ${plain(shape[k])}`;
      });
      rules.push(`${rule.padEnd(9)} = { ${body.join(", ")} }${strict ? "   (no other key)" : ""}`);
    }
    const ops = Object.values(core.FilterOpSchema._zod.def.entries);
    rules.unshift(`node      = ${alts.join(" | ")}`);
    rules.push(`op        = ${ops.map((o) => `"${o}"`).join(" | ")}`);

    // The builders of `filter`, called with their own parameter names: what each op's value looks like.
    const builders = Object.entries(core.filter).map(([fn, build]) => {
      const params = (/^\s*(?:function\s*\w*\s*)?\(([^)]*)\)/.exec(build.toString())?.[1] ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      // A parameter with a default is left out, so the condition shows what the default gives.
      const out = build(
        ...params.map((p) => (p.includes("=") ? undefined : `‹${p.replace(/^\.\.\./, "")}›`)),
      );
      return { fn, params: params.map((p) => p.replace(/\s*=\s*/, " = ")), out };
    });
    const opRows = ops.map((op) => {
      const b = builders.find((x) => x.out.op === op);
      const shape = b
        ? JSON.stringify(b.out)
            .replace(/"‹([^›]+)›"/g, "$1")
            .replace(/,/g, ", ")
            .replace(/:/g, ": ")
        : "";
      return [
        code(op),
        b ? code(`filter.${b.fn}(${b.params.join(", ")})`) : "",
        shape ? code(shape) : "",
      ];
    });

    const typeRows = core.FIELD_TYPES.map((type) => {
      const f = core.filterableForType(type);
      return [code(type), f.ops.map(code).join(" "), code(f.default_op), code(f.widget)];
    });
    for (const h of ["Grammar", "Operators", "Operators per field type"]) page.anchor(h);
    return [
      "A filter is one JSON value, a `node`: a condition on one field, or `and` / `or` over a list of",
      "nodes, or `not` over one. It is the `filter` of a [`udc.list`](/reference/actions/list/) request, the",
      "URL's `?f=` and the `when` of a row action.",
      "",
      "## Grammar",
      "",
      "```txt",
      ...rules,
      "```",
      "",
      "## Operators",
      "",
      "The builders of `filter` (exported by `@jsudc/core`) and the condition each one returns.",
      "",
      table(["Op", "Builder", "Condition"], opRows),
      "## Operators per field type",
      "",
      "What `describe` offers for a field of each type (`filterableForType`), before a view's",
      "`filterable` overrides it. A source answers the ops it supports in",
      "[`capabilities.supported_filter_ops`](/reference/envelope/#capabilities).",
      "",
      table(["Field type", "Ops", "Default op", "Widget"], typeRows),
    ].join("\n");
  },
});

PAGES.push({
  slug: "schema-json",
  title: "schema.json",
  description:
    "Every key of a collection's schema.json and of a field definition, and the field types.",
  order: 3,
  schemas: ["SchemaDocSchema", "FieldDefSchema", "FieldTypeSchema", "FieldNameSchema"],
  intro: (page) => {
    page.anchor("Field types");
    const phase1 = new Set(core.PHASE1_FIELD_TYPES);
    return [
      "A collection's `schema.json` is a `SchemaDoc`: its fields by name, their order and the revision it is.",
      `A field name matches ${code(core.FIELD_NAME_RE.source)}.`,
      "",
      "## Field types",
      "",
      table(
        ["Type", "Stored, sorted and filtered in phase 1"],
        core.FIELD_TYPES.map((t) => [code(t), phase1.has(t) ? "yes" : "parses; not yet stored"]),
      ),
    ].join("\n");
  },
});

const RENDERER_PAGES = {
  table: {
    schemas: [
      "ColumnConfigSchema",
      "ColumnColorSchema",
      "RowColorConfigSchema",
      "RowColorRuleSchema",
      "FolderOptionsSchema",
    ],
    keys: "`columns`, `row_color`, `folder_options`",
  },
  cards: { schemas: ["CardOptionsSchema"], keys: "`card_options`" },
  kanban: { schemas: ["KanbanOptionsSchema"], keys: "`kanban_options`" },
  calendar: { schemas: ["CalendarOptionsSchema"], keys: "`calendar_options`" },
  tree: { schemas: ["TreeOptionsSchema"], keys: "`tree_options`" },
  map: { schemas: ["MapOptionsSchema"], keys: "`map_options`" },
  chart: { schemas: ["ChartOptionsSchema"], keys: "`chart_options`" },
};

PAGES.push({
  slug: "view-yaml",
  title: "view.yaml",
  description:
    "Every top-level key of a collection's view.yaml, and the blocks every renderer shares.",
  order: 4,
  schemas: [
    "ViewConfigSchema",
    "SearchConfigSchema",
    "FilterChipConfigSchema",
    "FilterableConfigSchema",
    "FilterableFieldConfigSchema",
    "ActionDefSchema",
    "EditModeConfigSchema",
    "PreviewConfigSchema",
  ],
  intro: (page) => {
    page.anchor("Renderers");
    return [
      "A collection's `view.yaml` is a `ViewConfig`. The keys every renderer reads are below; each",
      "renderer's own block has its page.",
      "",
      "## Renderers",
      "",
      table(
        ["Renderer", "Its keys"],
        core.RENDERER_NAMES.map((r) => [
          RENDERER_PAGES[r] ? `[${code(r)}](/reference/renderers/${r}/)` : code(r),
          RENDERER_PAGES[r]?.keys ?? "",
        ]),
      ),
      "`available_renderers` is an open list: a name jsudc does not know parses, and the data view shows",
      "its tab disabled.",
      "",
    ].join("\n");
  },
});

core.RENDERER_NAMES.forEach((r, i) => {
  const spec = RENDERER_PAGES[r];
  if (!spec) return;
  PAGES.push({
    slug: `renderers/${r}`,
    title: `${r[0].toUpperCase()}${r.slice(1)}: ${spec.keys.replace(/`/g, "")}`,
    sidebarLabel: r[0].toUpperCase() + r.slice(1),
    description: `The view.yaml keys the ${r} renderer reads: ${spec.keys.replace(/`/g, "")}.`,
    order: 20 + i,
    schemas: spec.schemas,
    intro: () =>
      `What the ${r} renderer reads from \`view.yaml\`: ${spec.keys}. The keys every renderer shares are on [view.yaml](/reference/view-yaml/).\n`,
  });
});

PAGES.push({
  slug: "source-yaml",
  title: "source.yaml",
  description: "Where a collection's rows come from: every source kind and its options.",
  order: 5,
  schemas: ["SourceConfigSchema", "SourceKindSchema"],
  intro: (page) => {
    page.anchor("Kinds");
    const union = unwrap(core.SourceConfigSchema, core.SourceConfigSchema).schema._zod.def.options;
    const rows = union.map((o) => {
      const shape = unwrap(o).schema._zod.def.shape;
      const kind = unwrap(shape.kind).schema._zod.def.values[0];
      const opts = unwrap(shape.options);
      return [
        code(kind),
        code(core.sourceGroup(kind)),
        typeText(shape.options, page, { path: `${kind} options`, docOwner: "", docPrefix: "" }),
        opts.hasDefault ? "may be omitted" : "required",
      ];
    });
    return [
      "A collection's `source.yaml` says where its rows live. No file means `kind: postgres_jsonb`.",
      "A file may nest the options under `options:` or write them flat next to `kind`; both parse.",
      "",
      "## Kinds",
      "",
      table(["kind", "Sidebar group", "options", "The options block"], rows),
    ].join("\n");
  },
});

// --- write ------------------------------------------------------------------------------

for (const p of PAGES) for (const name of p.schemas) if (!OWNER.has(name)) OWNER.set(name, p.slug);
for (const p of PAGES) {
  for (const name of p.schemas) {
    if (!EXPORTS.get(name))
      throw new Error(`gen-reference: @jsudc/core ${VERSION} exports no ${name} (page ${p.slug})`);
  }
}

await rm(OUT, { recursive: true, force: true });

const frontmatter = (p) =>
  [
    "---",
    `title: ${JSON.stringify(p.title)}`,
    `description: ${JSON.stringify(p.description)}`,
    "sidebar:",
    `  order: ${p.order}`,
    ...(p.sidebarLabel ? [`  label: ${JSON.stringify(p.sidebarLabel)}`] : []),
    "editUrl: false",
    "---",
    "",
    `{/* Generated by scripts/gen-reference.mjs from @jsudc/core ${VERSION}. Do not edit: the build rewrites it. */}`,
    "",
  ].join("\n");

let count = 0;
for (const p of PAGES) {
  const page = new Page(p.slug);
  const intro = p.intro ? p.intro(page) : "";
  for (const name of p.schemas) section(page, name);
  drain(page, 2);
  const used = p.files ?? files(...page.done);
  const text = [frontmatter(p), banner(used), intro, ...page.parts]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  const file = join(OUT, `${p.slug}.mdx`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  count++;
}

// The overview, last: it lists what was written.
const list = (filter) =>
  PAGES.filter(filter)
    .map((p) => `- [${p.title}](/reference/${p.slug}/): ${p.description}`)
    .join("\n");
await writeFile(
  join(OUT, "index.mdx"),
  [
    frontmatter({
      title: "Reference",
      description: `Every message, payload and file of jsudc, generated from @jsudc/core ${VERSION}.`,
      order: 0,
      sidebarLabel: "Overview",
    }),
    banner(),
    "The protocol and the three files of a collection, key by key. The [Concepts](/concepts/) pages",
    "explain them; these pages are the exact shape.",
    "",
    "## Protocol",
    "",
    list((p) => p.slug === "envelope" || p.slug === "filter"),
    "",
    "## Actions",
    "",
    list((p) => p.slug.startsWith("actions/")),
    "",
    "## Collection files",
    "",
    list((p) => ["schema-json", "view-yaml", "source-yaml"].includes(p.slug)),
    "",
    "## Renderer options",
    "",
    list((p) => p.slug.startsWith("renderers/")),
    "",
  ].join("\n"),
);
count++;

console.log(
  `gen-reference: ${count} pages from @jsudc/core ${VERSION} → src/content/docs/reference/`,
);
