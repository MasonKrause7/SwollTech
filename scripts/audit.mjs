// Fails on any high or critical advisory in shipped (non-dev) JS dependencies,
// except the ones listed in audit-allowlist.json. Each allowlisted advisory needs a
// reason and a revisit date; once the date passes, it fails again.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allowlist = JSON.parse(readFileSync(new URL("../audit-allowlist.json", import.meta.url), "utf8"));
const today = new Date().toISOString().slice(0, 10);

let raw;
try {
  raw = execSync("npm audit --omit=dev --json", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  raw = err.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw);

const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === "object" && ["high", "critical"].includes(via.severity)) {
      const id = via.url.split("/").pop();
      advisories.set(id, `${via.name}: ${via.title} (${via.severity})`);
    }
  }
}

const failures = [];
for (const [id, summary] of advisories) {
  const entry = allowlist.find((a) => a.id === id);
  if (!entry) failures.push(`${id} ${summary}`);
  else if (entry.revisitBy < today) failures.push(`${id} ${summary}: allowlist entry expired on ${entry.revisitBy}`);
  else console.log(`allowed until ${entry.revisitBy}: ${id} ${summary}. ${entry.reason}`);
}

if (failures.length) {
  console.error("High-severity advisories in shipped JS dependencies:\n" + failures.map((f) => `  ${f}`).join("\n"));
  process.exit(1);
}
console.log("No unallowed high-severity advisories.");
