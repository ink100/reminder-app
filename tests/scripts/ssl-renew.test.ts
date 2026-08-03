import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function executable(path: string, content: string) {
  writeFileSync(path, content, "utf8");
  chmodSync(path, 0o755);
}

function prepareRenewalFixture(
  acmeBehavior: "unchanged" | "skipped-code" | "skipped-code-renewed" | "renewed" | "failed" | "failed-renewed" | "renewed-unreadable" | "unchanged-unreadable" | "renewed-killed" | "unchanged-killed",
  nginxFailure: "none" | "test-once" | "reload-once" = "none",
  runCount = 1,
  unreadableRuns: number[] = [],
  failStatusWrites = false,
) {
  const directory = mkdtempSync(join(tmpdir(), "ssl-renew-test-"));
  temporaryDirectories.push(directory);
  const appDirectory = join(directory, "app");
  const binDirectory = join(directory, "bin");
  execFileSync("mkdir", ["-p", join(appDirectory, "logs"), join(appDirectory, "data"), binDirectory]);

  const certificateFile = join(directory, "certificate.cer");
  const logFile = join(appDirectory, "logs", "ssl-renew.log");
  const statusFile = join(appDirectory, "data", "ssl-status.json");
  const reloadMarker = join(directory, "nginx-reload.log");
  const nginxFailureMarker = join(directory, "nginx-failure-used");
  const certificateUnreadableMarker = join(directory, "certificate-unreadable");
  const acmeMarker = join(directory, "acme-calls.log");
  const preNginxStatusFile = join(directory, "pre-nginx-status.json");
  const acmeFile = join(directory, "acme.sh");
  writeFileSync(certificateFile, "old-certificate", "utf8");
  writeFileSync(statusFile, JSON.stringify({ lastRenew: "2026-05-28T00:00:00+08:00" }), "utf8");

  executable(join(binDirectory, "openssl"), `#!/bin/bash
if [ -f "${certificateUnreadableMarker}" ]; then
  exit 1
fi
if [[ "$*" == *"-enddate"* ]]; then
  echo "notAfter=Dec 31 23:59:59 2030 GMT"
elif [[ "$*" == *"-fingerprint"* ]]; then
  value=$(sha256sum "${certificateFile}" | cut -d' ' -f1)
  echo "sha256 Fingerprint=$value"
else
  exit 1
fi
`);
  executable(join(binDirectory, "sudo"), `#!/bin/bash
echo "$*" >> "${reloadMarker}"
if [ ! -f "${preNginxStatusFile}" ]; then
  cp "${statusFile}" "${preNginxStatusFile}"
fi
if [ ! -f "${nginxFailureMarker}" ]; then
  if [ "${nginxFailure}" = "test-once" ] && [ "$*" = "nginx -t" ]; then
    touch "${nginxFailureMarker}"
    exit 7
  fi
  if [ "${nginxFailure}" = "reload-once" ] && [ "$*" = "nginx -s reload" ]; then
    touch "${nginxFailureMarker}"
    exit 8
  fi
fi
exit 0
`);
  executable(join(binDirectory, "npx"), "#!/bin/bash\nexit 0\n");

  const acmeBody = acmeBehavior === "renewed-killed"
    ? `echo renewed-certificate > "${certificateFile}"\nkill -KILL "$PPID"\nsleep 1`
    : acmeBehavior === "unchanged-killed"
      ? `kill -KILL "$PPID"\nsleep 1`
      : acmeBehavior === "renewed" || acmeBehavior === "skipped-code-renewed" || acmeBehavior === "failed-renewed" || acmeBehavior === "renewed-unreadable"
        ? `echo renewed-certificate > "${certificateFile}"\n${acmeBehavior === "renewed-unreadable" ? `touch "${certificateUnreadableMarker}"` : ""}\necho "Renew result"\nexit ${acmeBehavior === "skipped-code-renewed" ? 2 : acmeBehavior === "failed-renewed" ? 9 : 0}`
    : acmeBehavior === "unchanged-unreadable"
      ? `touch "${certificateUnreadableMarker}"\necho "Renew result"\nexit 0`
    : acmeBehavior === "failed"
      ? "echo 'renew failed' >&2\nexit 9"
      : `echo 'Skipping. Next renewal time is later'\nexit ${acmeBehavior === "skipped-code" ? 2 : 0}`;
  executable(acmeFile, `#!/bin/bash\necho call >> "${acmeMarker}"\n${acmeBody}\n`);

  const source = readFileSync(resolve("scripts/ssl-renew.sh"), "utf8");
  const isolatedSource = source
    .replace(/^LOG_FILE=.*$/m, `LOG_FILE="${logFile}"`)
    .replace(/^CERT_FILE=.*$/m, `CERT_FILE="${certificateFile}"`)
    .replace(/^APP_DIR=.*$/m, `APP_DIR="${appDirectory}"`)
    .replace(/^STATUS_FILE=.*$/m, `STATUS_FILE="${statusFile}"`)
    .replace(/^ACME_SH=.*$/m, `ACME_SH="${acmeFile}"`)
    .replace(/^LOCK_FILE=.*$/m, `LOCK_FILE="${join(directory, "ssl-renew.lock")}"`)
    .replace(/^RENEW_THRESHOLD_DAYS=.*$/m, "RENEW_THRESHOLD_DAYS=9999")
    .replace(/^.*(?:acme\.sh|\$ACME_SH).*--renew[^\n]*\| tee -a "\$LOG_FILE"$/m, `"${acmeFile}" --renew -d daydreams.cn --ecc 2>&1 | tee -a "$LOG_FILE"`);
  const scriptFile = join(directory, "ssl-renew.sh");
  executable(scriptFile, isolatedSource);

  if (failStatusWrites) chmodSync(join(appDirectory, "data"), 0o555);

  const results = [];
  const statuses: Array<Record<string, unknown>> = [];
  for (let run = 0; run < runCount; run += 1) {
    if (unreadableRuns.includes(run)) writeFileSync(certificateUnreadableMarker, "1", "utf8");
    else rmSync(certificateUnreadableMarker, { force: true });
    results.push(spawnSync("bash", [scriptFile], {
      cwd: appDirectory,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDirectory}:${process.env.PATH ?? ""}` },
    }));
    statuses.push(JSON.parse(readFileSync(statusFile, "utf8")) as Record<string, unknown>);
  }
  if (failStatusWrites) chmodSync(join(appDirectory, "data"), 0o755);

  return {
    result: results.at(-1)!,
    results,
    statuses,
    status: JSON.parse(readFileSync(statusFile, "utf8")) as Record<string, unknown>,
    reloadLog: (() => { try { return readFileSync(reloadMarker, "utf8"); } catch { return ""; } })(),
    acmeLog: (() => { try { return readFileSync(acmeMarker, "utf8"); } catch { return ""; } })(),
    preNginxStatus: (() => { try { return JSON.parse(readFileSync(preNginxStatusFile, "utf8")) as Record<string, unknown>; } catch { return {}; } })(),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("SSL renewal script business result", () => {
  it("records a successful acme check with an unchanged certificate as skipped", () => {
    const fixture = prepareRenewalFixture("unchanged");

    expect(fixture.result.status).toBe(0);
    expect(fixture.status).toMatchObject({
      lastAction: "skipped",
      skipped: true,
      lastRenew: "2026-05-28T00:00:00+08:00",
    });
    expect(fixture.reloadLog).toBe("");
  });

  it("treats the acme renewal skip exit code as a successful skipped check", () => {
    const fixture = prepareRenewalFixture("skipped-code");

    expect(fixture.result.status).toBe(0);
    expect(fixture.status).toMatchObject({
      lastAction: "skipped",
      lastResult: 0,
      skipped: true,
      lastRenew: "2026-05-28T00:00:00+08:00",
    });
    expect(fixture.reloadLog).toBe("");
  });

  it("treats a changed certificate as renewed even when acme returns its skip code", () => {
    const fixture = prepareRenewalFixture("skipped-code-renewed");

    expect(fixture.result.status).toBe(0);
    expect(fixture.status).toMatchObject({ lastAction: "renewed", skipped: false, certificateChanged: true });
    expect(fixture.reloadLog).toContain("nginx -t");
    expect(fixture.reloadLog).toContain("nginx -s reload");
  });

  it("records renewed and reloads nginx only when the managed certificate changes", () => {
    const fixture = prepareRenewalFixture("renewed");

    expect(fixture.result.status).toBe(0);
    expect(fixture.status).toMatchObject({ lastAction: "renewed", skipped: false });
    expect(fixture.status.lastRenew).not.toBe("2026-05-28T00:00:00+08:00");
    expect(fixture.reloadLog).toContain("nginx -t");
    expect(fixture.reloadLog).toContain("nginx -s reload");
  });

  it("preserves lastRenew and exits non-zero when acme fails", () => {
    const fixture = prepareRenewalFixture("failed");

    expect(fixture.result.status).not.toBe(0);
    expect(fixture.status).toMatchObject({
      lastAction: "failed",
      skipped: false,
      lastRenew: "2026-05-28T00:00:00+08:00",
    });
    expect(fixture.reloadLog).toBe("");
  });

  for (const nginxFailure of ["test-once", "reload-once"] as const) {
    it(`persists and retries a pending nginx activation after ${nginxFailure}`, () => {
      const fixture = prepareRenewalFixture("renewed", nginxFailure, 2);

      expect(fixture.results[0].status).not.toBe(0);
      expect(fixture.statuses[0]).toMatchObject({
        lastAction: "failed",
        certificateChanged: true,
        reloadPending: true,
      });
      expect(fixture.results[1].status).toBe(0);
      expect(fixture.statuses[1]).toMatchObject({
        lastAction: "renewed",
        certificateChanged: true,
        reloadPending: false,
      });
      expect(fixture.statuses[1].lastRenew).toBe(fixture.statuses[0].lastRenew);
      expect(fixture.acmeLog.trim().split("\n")).toHaveLength(1);
      expect(fixture.reloadLog.match(/nginx -t/g)).toHaveLength(2);
    });
  }

  it("preserves pending activation across a temporarily unreadable certificate and retries after recovery", () => {
    const fixture = prepareRenewalFixture("renewed", "test-once", 3, [1]);

    expect(fixture.statuses[0]).toMatchObject({ lastAction: "failed", reloadPending: true });
    expect(fixture.statuses[1]).toMatchObject({ lastAction: "failed", reloadPending: true });
    expect(fixture.statuses[2]).toMatchObject({ lastAction: "renewed", reloadPending: false });
    expect(fixture.acmeLog.trim().split("\n")).toHaveLength(1);
  });

  it("does not mask an unexpected acme failure when the certificate file changed", () => {
    const fixture = prepareRenewalFixture("failed-renewed");

    expect(fixture.result.status).toBe(9);
    expect(fixture.status).toMatchObject({
      lastAction: "failed",
      lastResult: 9,
      certificateChanged: true,
      reloadPending: false,
    });
    expect(fixture.reloadLog).toContain("nginx -s reload");
  });

  it("persists activation state before the first nginx command", () => {
    const fixture = prepareRenewalFixture("renewed");

    expect(fixture.preNginxStatus).toMatchObject({
      lastAction: "pending",
      certificateChanged: true,
      reloadPending: true,
    });
  });

  it("conservatively retries activation when the certificate is unreadable immediately after acme changes it", () => {
    const fixture = prepareRenewalFixture("renewed-unreadable", "none", 2);

    expect(fixture.results[0].status).not.toBe(0);
    expect(fixture.statuses[0]).toMatchObject({ lastAction: "failed", reloadPending: true });
    expect(fixture.results[1].status).toBe(0);
    expect(fixture.statuses[1]).toMatchObject({ lastAction: "renewed", reloadPending: false, certificateChanged: true });
    expect(fixture.statuses[1].lastRenew).not.toBe("2026-05-28T00:00:00+08:00");
    expect(fixture.acmeLog.trim().split("\n")).toHaveLength(1);
  });

  it("does not report renewal when post-acme unreadability recovers to an unchanged certificate", () => {
    const fixture = prepareRenewalFixture("unchanged-unreadable", "none", 2);

    expect(fixture.statuses[0]).toMatchObject({ lastAction: "failed", reloadPending: true });
    expect(fixture.results[1].status).toBe(0);
    expect(fixture.statuses[1]).toMatchObject({
      lastAction: "skipped",
      certificateChanged: false,
      reloadPending: false,
      lastRenew: "2026-05-28T00:00:00+08:00",
    });
    expect(fixture.reloadLog).toBe("");
  });

  it("fails closed before nginx when durable status persistence fails", () => {
    const fixture = prepareRenewalFixture("renewed", "none", 1, [], true);

    expect(fixture.result.status).not.toBe(0);
    expect(fixture.reloadLog).toBe("");
  });

  it("recovers a changed certificate after interruption immediately following acme", () => {
    const fixture = prepareRenewalFixture("renewed-killed", "none", 2);

    expect(fixture.results[0].status).not.toBe(0);
    expect(fixture.statuses[0]).toMatchObject({ lastAction: "checking", reloadPending: false });
    expect(fixture.results[1].status).toBe(0);
    expect(fixture.statuses[1]).toMatchObject({ lastAction: "renewed", reloadPending: false, certificateChanged: true });
    expect(fixture.acmeLog.trim().split("\n")).toHaveLength(1);
    expect(fixture.reloadLog).toContain("nginx -s reload");
  });

  it("clears an interrupted acme check without nginx reload when the certificate stayed unchanged", () => {
    const fixture = prepareRenewalFixture("unchanged-killed", "none", 2);

    expect(fixture.results[0].status).not.toBe(0);
    expect(fixture.results[1].status).toBe(0);
    expect(fixture.statuses[1]).toMatchObject({
      lastAction: "skipped",
      reloadPending: false,
      certificateChanged: false,
      lastRenew: "2026-05-28T00:00:00+08:00",
    });
    expect(fixture.acmeLog.trim().split("\n")).toHaveLength(1);
    expect(fixture.reloadLog).toBe("");
  });
});

describe("SSL status endpoint semantics", () => {
  it("keeps GET read-only and leaves reminder synchronization to explicit renewal flows", () => {
    const source = readFileSync(resolve("server/handlers/api/ssl/route.ts"), "utf8");
    const getHandler = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function POST"));

    expect(getHandler).not.toContain("syncSslCertificateReminder(");
  });

  it("uses app-specific override names instead of ambient TLS variables", () => {
    const scriptSource = readFileSync(resolve("scripts/ssl-renew.sh"), "utf8");
    const routeSource = readFileSync(resolve("server/handlers/api/ssl/route.ts"), "utf8");

    expect(scriptSource).toContain("REMINDER_SSL_CERT_FILE");
    expect(scriptSource).not.toContain("${SSL_CERT_FILE:-");
    for (const variable of ["REMINDER_SSL_CERT_FILE", "REMINDER_SSL_STATUS_FILE", "REMINDER_SSL_LOG_FILE", "REMINDER_SSL_ACME_SH"]) {
      expect(routeSource).toContain(variable);
    }
  });

  it("serializes scheduler and manual renewal runs with a shared lock", () => {
    const source = readFileSync(resolve("scripts/ssl-renew.sh"), "utf8");

    expect(source).toContain("REMINDER_SSL_LOCK_FILE");
    expect(source).toContain("flock");
  });
});
