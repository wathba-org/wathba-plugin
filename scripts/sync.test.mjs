// Unit tests for the skill rules in sync.mjs. Node's built-in runner, no
// dependencies: node --test scripts/*.test.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";

import {
  build,
  checkSkill,
  loadConfig,
  loadSources,
  RuleError,
  serviceCodesIn,
  SKILL_MAX_BYTES,
  skillFor,
  validate,
} from "./sync.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const config = {
  skill: {
    tools: ["wathba_get_service", "wathba_open_flow"],
    nonToolTerms: ["card_opened"],
  },
};

// The smallest skill that passes every rule.
function skill(body = "", description = "Use for anything involving Wathba.") {
  return (
    `---\nname: wathba\ndescription: "${description}"\n---\n\n# Wathba\n\n` +
    `Read \`wathba_get_service\`, then \`wathba_open_flow\`.\n${body}`
  );
}

// The four tools every host lists, and the names that left the list: each
// tool by its own name and by the name hosts listed before it (the platform's
// juriba/mcp-four-tools). The 16 stay callable in chats opened before, but no
// new chat lists them: their work is now operations.
const FOUR_TOOLS = [
  "wathba_execute_read_operation",
  "wathba_execute_write_operation",
  "wathba_get_service",
  "wathba_open_flow",
];
const UNLISTED_TOOLS = {
  get_service: "get_wathba_service",
  open_flow: "open_wathba_flow",
  execute_read_operation: "execute_wathba_read_operation",
  execute_write_operation: "execute_wathba_write_operation",
  list_notices: "list_wathba_notices",
  list_projects: "list_wathba_projects",
  get_project_setup: "get_wathba_project_setup",
  list_project_services: "list_wathba_project_services",
  get_service_integration_docs: "get_wathba_service_integration_docs",
  recommend_services_for_repository: "recommend_wathba_services_for_repository",
  create_project: "create_wathba_project",
  report_issue: "report_wathba_issue",
  get_domain_dns_records: "get_wathba_domain_dns_records",
  change_domain_dns_record: "change_wathba_domain_dns_record",
  change_domain_nameservers: "change_wathba_domain_nameservers",
  inspect_api_upgrade: "inspect_wathba_api_upgrade",
  preview_api_upgrade: "preview_wathba_api_upgrade",
  prepare_api_upgrade: "prepare_wathba_api_upgrade",
  apply_api_upgrade: "apply_wathba_api_upgrade",
  rollback_api_upgrade: "rollback_wathba_api_upgrade",
};

/** Whether `text` names `tool` as a whole word (get_service is inside wathba_get_service). */
function names(text, tool) {
  return new RegExp(`(?<![A-Za-z0-9_])${tool}(?![A-Za-z0-9_])`).test(text);
}

function passes(text, target = "prod") {
  assert.doesNotThrow(() => checkSkill(text, config, target));
}

function fails(text, message, target = "prod") {
  assert.throws(
    () => checkSkill(text, config, target),
    (error) => error instanceof RuleError && message.test(error.message),
  );
}

describe("the committed skill", () => {
  test("passes every skill rule in both targets and fits the cap", async () => {
    const real = await loadConfig();
    const { skill: source } = await loadSources(real);
    for (const target of ["prod", "dev"]) {
      const built = skillFor(source, target);
      checkSkill(built, real, target);
      assert.ok(Buffer.byteLength(built) <= SKILL_MAX_BYTES, `${target} is over the cap`);
    }
  });

  test("relies on exactly the four listed tools", async () => {
    const real = await loadConfig();
    assert.deepEqual([...real.skill.tools].sort(), FOUR_TOOLS);
  });

  test("names no tool outside the four, by its own name or the one hosts listed before", async () => {
    const real = await loadConfig();
    const { skill: source } = await loadSources(real);
    for (const [own, listed] of Object.entries(UNLISTED_TOOLS))
      for (const tool of [own, listed]) {
        assert.ok(!real.skill.tools.includes(tool), `${tool} is in skill.tools`);
        assert.ok(!real.skill.nonToolTerms.includes(tool), `${tool} is in skill.nonToolTerms`);
        assert.ok(!names(source, tool), `${tool} is in SKILL.md`);
      }
  });
});

describe("byte cap", () => {
  test("is 8,000 bytes", () => {
    assert.equal(SKILL_MAX_BYTES, 8000);
  });

  test("passes a skill of exactly the cap and fails one byte over", () => {
    const base = skill();
    const atCap = skill("x".repeat(SKILL_MAX_BYTES - Buffer.byteLength(base)));
    assert.equal(Buffer.byteLength(atCap), SKILL_MAX_BYTES);
    passes(atCap);
    fails(`${atCap}x`, /is 8001 bytes, over the 8000-byte cap/);
  });

  test("counts UTF-8 bytes, so Arabic counts double", () => {
    const base = skill();
    const letters = Math.floor((SKILL_MAX_BYTES - Buffer.byteLength(base)) / 2) + 1;
    const arabic = skill("ب".repeat(letters));
    assert.ok(arabic.length < SKILL_MAX_BYTES, "under the cap in characters");
    assert.ok(Buffer.byteLength(arabic) > SKILL_MAX_BYTES, "over the cap in bytes");
    fails(arabic, /over the 8000-byte cap/);
  });

  test("applies to the DEV build too", () => {
    const over = "x".repeat(SKILL_MAX_BYTES);
    const source = skill(`<!-- dev-only: DEV only -->\n${over}\n<!-- /dev-only -->\n`);
    passes(skillFor(source, "prod"), "prod");
    fails(skillFor(source, "dev"), /the built dev SKILL\.md is \d+ bytes/, "dev");
  });
});

describe("service codes", () => {
  const today = [
    "payments.moyasar",
    "messaging.otp.authentica",
    "domains.souq-t2",
    "calls.ai",
    "shipping.torod",
    "realestate.ejar",
  ];

  test("fails on every service code Wathba has today, quoted or bare", () => {
    for (const code of today) {
      const escaped = code.replace(/\./g, "\\.");
      fails(skill(`Turn on \`${code}\` first.\n`), new RegExp(`names ${escaped},`));
      fails(skill(`Turn on ${code}.\n`), new RegExp(`names ${escaped},`));
      fails(skill(`- Wathba Pay (${code}): enable it.\n`), new RegExp(`names ${escaped},`));
    }
  });

  test("fails on a code of a kind that doesn't exist yet", () => {
    for (const code of ["insurance.tameeni", "logistics.fast_ship", "kyc.nafath-v2"])
      assert.deepEqual(serviceCodesIn(`Use \`${code}\` here.`), [code]);
  });

  test("fails on one in the frontmatter description", () => {
    fails(skill("", "Use for Wathba, such as payments.moyasar."), /names payments\.moyasar,/);
  });

  test("fails on one in a dev-only block of the DEV build", () => {
    const source = skill("<!-- dev-only: DEV only -->\nThe service shipping.torod.\n<!-- /dev-only -->\n");
    passes(skillFor(source, "prod"), "prod");
    fails(skillFor(source, "dev"), /names shipping\.torod,/, "dev");
  });

  test("ignores prose, versions, paths, URLs, file names and e-mail addresses", () => {
    const allowed = [
      "For example (e.g. a card), i.e. the member's step.",
      "Member API v1.2 and 2026.11 releases.",
      "Open https://platform.wathba.sa/agent/flow/flw_1 in the browser.",
      "Link [.env.local](/full/path/to/app/.env.local) and app/config.local.json.",
      "Write it in Node.js, not in the browser.",
      "Mail member@wathba.sa or first.last@example.sa.",
      "Offer `.sa` and `.com.sa` names.",
      "Read `nextStep.args` and `result.nextCursor`.",
    ].join("\n");
    assert.deepEqual(serviceCodesIn(allowed), []);
    passes(skill(`${allowed}\n`));
  });

  test("lets a known app file and a path into a Wathba result through, and nothing else", () => {
    assert.deepEqual(serviceCodesIn("Read `package.json` and `tsconfig.json` for the stack."), []);
    assert.deepEqual(serviceCodesIn("Read `playbook.body` and `result.outcome`."), []);
    passes(skill("Read `package.json`, then `playbook.body`.\n"));
    // A code whose last part looks like a file extension is still a code.
    for (const code of ["domains.sh", "domains.md", "storage.json", "payments.go"]) {
      assert.deepEqual(serviceCodesIn(`Turn on ${code}.`), [code]);
      fails(skill(`Turn on ${code}.\n`), /has the shape of a service code/);
    }
    // No list in the config lets one through.
    assert.deepEqual(serviceCodesIn("Read `playbook.body` of payments.moyasar."), ["payments.moyasar"]);
    const listed = {
      skill: { ...config.skill, fieldPaths: ["payments.moyasar"], fileNames: ["payments.moyasar"] },
    };
    assert.throws(
      () => checkSkill(skill("Turn on payments.moyasar.\n"), listed, "prod"),
      (error) => error instanceof RuleError && /names payments\.moyasar,/.test(error.message),
    );
    assert.deepEqual(serviceCodesIn("Turn on calls.ai."), ["calls.ai"]);
  });

  test("refuses a bare host name, because some codes end in a top-level domain", () => {
    assert.deepEqual(serviceCodesIn("Sign in at wathba.sa."), ["wathba.sa"]);
  });
});

describe("declared tools", () => {
  test("fail an undeclared tool-shaped term", () => {
    fails(skill("Then `create_wathba_project`.\n"), /`create_wathba_project` is not a declared tool/);
  });

  test("fail when a declared tool is not in the skill", () => {
    const text = skill().replace("`wathba_open_flow`", "the flow tool");
    fails(text, /declared tool wathba_open_flow does not appear/);
  });

  test("fail the older names of a listed tool", () => {
    fails(skill("Then `get_wathba_service`.\n"), /`get_wathba_service` is not a declared tool/);
    fails(skill("Then `get_service`.\n"), /`get_service` is not a declared tool/);
  });

  test("allow a declared non-tool term", () => {
    passes(skill("The outcome `card_opened` means a card is on screen.\n"));
  });
});

describe("the command line", () => {
  const digest = /^sha256:[0-9a-f]{64}\n$/;

  test("runs when called as a script", () => {
    const out = execFileSync(process.execPath, [join(ROOT, "scripts/sync.mjs"), "digest", "--target", "prod"], {
      encoding: "utf8",
    });
    assert.match(out, digest);
  });

  test("runs from a symlinked checkout, not silently doing nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "wathba-sync-"));
    try {
      symlinkSync(ROOT, join(dir, "repo"), "dir");
      const out = execFileSync(
        process.execPath,
        [join(dir, "repo/scripts/sync.mjs"), "digest", "--target", "prod"],
        { encoding: "utf8" },
      );
      assert.match(out, digest);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Gemini CLI installs the whole repository as one extension (manifest and
// skills/ at the root); Cursor reads .cursor-plugin/plugin.json first.
describe("Gemini CLI and Cursor packages", () => {
  const versions = { prod: "9.9.9", dev: "9.9.9-dev.1" };

  async function built(target) {
    const config = await loadConfig();
    const files = build(config, await loadSources(config), target, versions[target]);
    return { config, files, plugin: config.targets[target].plugin };
  }

  function rejects(config, target, files, message) {
    assert.throws(() => validate(config, target, files, versions[target]), (error) => {
      assert.ok(error instanceof RuleError);
      assert.match(error.message, message);
      return true;
    });
  }

  function edited(files, path, change) {
    const copy = new Map(files);
    const value = JSON.parse(copy.get(path));
    change(value);
    copy.set(path, `${JSON.stringify(value, null, 2)}\n`);
    return copy;
  }

  for (const target of ["prod", "dev"]) {
    test(`${target}: one Gemini server at its own origin, and the plugin's skill at the root`, async () => {
      const { config, files, plugin } = await built(target);
      const { serverKey, apiOrigin } = config.targets[target];
      assert.deepEqual(JSON.parse(files.get("gemini-extension.json")), {
        name: plugin,
        version: versions[target],
        description: JSON.parse(files.get(`plugins/${plugin}/plugin.json`)).description,
        mcpServers: { [serverKey]: { type: "http", url: `${apiOrigin}/mcp` } },
      });
      assert.equal(files.get("skills/wathba/SKILL.md"), files.get(`plugins/${plugin}/skills/wathba/SKILL.md`));
    });

    test(`${target}: Cursor's manifest names the plugin and a logo inside it`, async () => {
      const { config, files, plugin } = await built(target);
      const cursor = JSON.parse(files.get(`plugins/${plugin}/.cursor-plugin/plugin.json`));
      assert.equal(cursor.name, plugin);
      assert.equal(cursor.displayName, config.targets[target].displayName);
      assert.equal(cursor.version, versions[target]);
      assert.ok(files.has(`plugins/${plugin}/${cursor.logo}`));
    });
  }

  test("refuses a second Gemini server, the deprecated httpUrl, or another origin", async () => {
    const { config, files } = await built("prod");
    rejects(config, "prod", edited(files, "gemini-extension.json", (g) => {
      g.mcpServers.other = { type: "http", url: "https://example.com/mcp" };
    }), /exactly the wathba server/);
    rejects(config, "prod", edited(files, "gemini-extension.json", (g) => {
      g.mcpServers.wathba = { httpUrl: "https://api.wathba.sa/mcp" };
    }), /unexpected key httpUrl/);
    rejects(config, "prod", edited(files, "gemini-extension.json", (g) => {
      g.mcpServers.wathba.url = "https://apidev.wathba.sa/mcp";
    }), /must point http at https:\/\/api\.wathba\.sa\/mcp/);
    rejects(config, "prod", edited(files, "gemini-extension.json", (g) => {
      g.mcpServers.wathba.headers = { "X-Key": "1" };
    }), /unexpected key headers/);
  });

  test("refuses a root skill that drifted from the plugin's", async () => {
    const { config, files } = await built("prod");
    const copy = new Map(files);
    copy.set("skills/wathba/SKILL.md", `${files.get("skills/wathba/SKILL.md")}\nExtra.\n`);
    rejects(config, "prod", copy, /root skills\/ copy/);
  });

  test("refuses a Cursor logo outside the plugin or a component path", async () => {
    const { config, files } = await built("prod");
    const path = "plugins/wathba/.cursor-plugin/plugin.json";
    rejects(config, "prod", edited(files, path, (c) => {
      c.logo = "../../src/assets/wathba-icon-light.png";
    }), /Cursor logo/);
    rejects(config, "prod", edited(files, path, (c) => {
      c.mcpServers = "./mcp.json";
    }), /unexpected key mcpServers/);
  });
});
