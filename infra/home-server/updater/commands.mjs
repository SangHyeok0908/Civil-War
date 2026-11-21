import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import { formatAlert, sendAlert } from "./alerts.mjs";
import { selectBackupsToDelete } from "./backups.mjs";
import { saveState } from "./state.mjs";

const BACKUP_SCRIPT = 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc';
// 스키마 삭제와 복원이 psql 한 트랜잭션 안에서 실행돼 중간에 실패하면 원래 DB가 남는다.
const RESTORE_SCRIPT = `{ printf 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;\\n'; pg_restore --no-owner -f -; } | psql -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"`;
const REVISION_FORMAT =
  '{{ index .Config.Labels "org.opencontainers.image.revision" }}';

function openStream(file, create) {
  return new Promise((resolve, reject) => {
    const stream = create(file);
    stream.once("error", reject);
    stream.once("open", () => resolve(stream));
  });
}

export function run(command, args, io = {}) {
  return new Promise((resolve, reject) => {
    (async () => {
      const input = io.stdinFile
        ? await openStream(io.stdinFile, createReadStream)
        : null;
      const output = io.stdoutFile
        ? await openStream(io.stdoutFile, createWriteStream)
        : null;
      const child = spawn(command, args, {
        stdio: [input ?? "ignore", output ?? "pipe", "inherit"],
      });
      let stdout = "";
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.once("error", reject);
      child.once("close", (code) => {
        input?.destroy();
        const finish = () => resolve({ code: code ?? 1, stdout });
        if (output) output.end(finish);
        else finish();
      });
    })().catch(reject);
  });
}

export function createDockerOps(options) {
  const {
    projectName,
    composeFile,
    projectDir,
    backupDir,
    sourceRef,
    waitTimeoutSeconds,
    webhookUrl,
    statePath,
    run: exec,
    pull = "always",
    fetchImpl = fetch,
    log = (message) => console.log(`${new Date().toISOString()} ${message}`),
  } = options;
  const compose = [
    "compose",
    "-p",
    projectName,
    "-f",
    composeFile,
    "--project-directory",
    projectDir,
  ];

  async function docker(args, io) {
    const result = await exec("docker", args, io);
    if (result.code !== 0) {
      throw new Error(`docker ${args[0]} 실패 (종료 코드 ${result.code})`);
    }
    return result;
  }

  async function inspect(format, ref) {
    const result = await exec("docker", [
      "image",
      "inspect",
      "--format",
      format,
      ref,
    ]);
    if (result.code !== 0) return null;
    return result.stdout.trim() || null;
  }

  return {
    log,
    now: () => new Date(),
    saveState: (state) => saveState(statePath, state),
    async pullSource() {
      if (pull === "never") return;
      await docker(["pull", "--quiet", sourceRef]);
    },
    imageId: (ref) => inspect("{{.Id}}", ref),
    imageRevision: (id) => inspect(REVISION_FORMAT, id),
    async tag(id, ref) {
      await docker(["tag", id, ref]);
    },
    async stop(services) {
      await docker([...compose, "stop", ...services]);
    },
    async start(services) {
      await docker([...compose, "start", ...services]);
    },
    async recreateServer() {
      await docker([
        ...compose,
        "up",
        "-d",
        "--no-deps",
        "--force-recreate",
        "--wait",
        "--wait-timeout",
        String(waitTimeoutSeconds),
        "server",
      ]);
    },
    async backup(name) {
      const file = join(backupDir, name);
      try {
        await docker(
          [...compose, "exec", "-T", "postgres", "sh", "-c", BACKUP_SCRIPT],
          { stdoutFile: file },
        );
        const info = await stat(file);
        if (info.size === 0) throw new Error("백업 파일이 비어 있습니다.");
      } catch (error) {
        // 쓰다 만 파일이 남아 정상 백업 대신 보관 개수를 차지하지 않게 지운다.
        await unlink(file).catch(() => {});
        throw error;
      }
    },
    async restore(name) {
      await docker(
        [...compose, "exec", "-T", "postgres", "sh", "-c", RESTORE_SCRIPT],
        { stdinFile: join(backupDir, name) },
      );
    },
    async pruneBackups(keep) {
      const names = await readdir(backupDir);
      for (const name of selectBackupsToDelete(names, keep)) {
        await unlink(join(backupDir, name));
      }
    },
    async alert(kind, info) {
      if (!webhookUrl) {
        log(`alert skipped: ${kind}`);
        return;
      }
      let ok = false;
      try {
        ok = await sendAlert(webhookUrl, formatAlert(kind, info), fetchImpl);
      } catch {
        ok = false;
      }
      log(ok ? `alert sent: ${kind}` : `alert failed: ${kind}`);
    },
  };
}
