// Unit tests for the skill rules in sync.mjs. Node's built-in runner, no
// dependencies: node --test scripts/*.test.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";

import {
  checkSkill,
  loadConfig,
  loadSources,
  RuleError,
  serviceCodesIn,
  SKILL_MAX_BYTES,
  skillFor,
} from "./sync.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const config = {
  skill: {
    tools: ["get_wathba_service", "open_wathba_flow"],
    nonToolTerms: ["card_opened"],
  },
};

// The smallest skill that passes every rule.
function skill(body = "", description = "Use for anything involving Wathba.") {
  return (
    `---\nname: wathba\ndescription: "${description}"\n---\n\n# Wathba\n\n` +
    `Read \`get_wathba_service\`, then \`open_wathba_flow\`.\n${body}`
  );
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

  test("names none of the DNS and API upgrade tools the platform is retiring", async () => {
    const real = await loadConfig();
    const { skill: source } = await loadSources(real);
    const retiring = [
      "get_wathba_domain_dns_records",
      "change_wathba_domain_dns_record",
      "change_wathba_domain_nameservers",
      "inspect_wathba_api_upgrade",
      "preview_wathba_api_upgrade",
      "prepare_wathba_api_upgrade",
      "apply_wathba_api_upgrade",
      "rollback_wathba_api_upgrade",
    ];
    for (const tool of retiring) {
      assert.ok(!real.skill.tools.includes(tool), `${tool} is in skill.tools`);
      assert.ok(!source.includes(tool), `${tool} is in SKILL.md`);
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
    const text = skill().replace("`open_wathba_flow`", "the flow tool");
    fails(text, /declared tool open_wathba_flow does not appear/);
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
