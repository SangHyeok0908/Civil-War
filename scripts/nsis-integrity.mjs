import { crc32 } from "node:zlib";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const signature = Buffer.from("efbeadde4e756c6c736f6674496e7374", "hex");

// NSIS exehead/fileform.c checks from byte 512 up to its stored CRC.
// Keep that original value: rewriting it would conceal extraction damage.
export function verifyNsisIntegrity(bytes) {
  for (let offset = 0; offset + 28 <= bytes.length; offset += 512) {
    const flags = bytes.readUInt32LE(offset);
    if (
      (flags & ~15) !== 0 ||
      !bytes.subarray(offset + 4, offset + 20).equals(signature)
    )
      continue;
    if ((flags & 4) !== 0 && (flags & 8) === 0)
      throw new Error("NSIS_CRC_DISABLED");
    const length = bytes.readUInt32LE(offset + 24);
    if (length < 32 || length > bytes.length - offset)
      throw new Error("NSIS_INVALID_LENGTH");
    const crcOffset = offset + length - 4;
    const actual = crc32(bytes.subarray(offset === 0 ? 0 : 512, crcOffset));
    if (actual !== bytes.readUInt32LE(crcOffset))
      throw new Error("NSIS_CRC_MISMATCH");
    return {
      headerOffset: offset,
      crcOffset,
      crc32: actual.toString(16).padStart(8, "0"),
    };
  }
  throw new Error("NSIS_HEADER_MISSING");
}

export async function verifyEmbeddedUninstaller(installer) {
  verifyNsisIntegrity(await readFile(installer));
  const require = createRequire(import.meta.url);
  const builder = dirname(
    require.resolve("app-builder-lib", {
      paths: [require.resolve("electron-builder")],
    }),
  );
  const { getPath7za } = require(join(builder, "toolsets/7zip.js"));
  const extracted = spawnSync(
    await getPath7za(),
    ["x", "-so", installer, "$R0/Uninstall Civil War Collector.exe"],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  if (
    extracted.error ||
    extracted.status !== 0 ||
    extracted.stdout.length === 0
  )
    throw new Error("UNINSTALLER_EXTRACTION_FAILED");
  const integrity = verifyNsisIntegrity(extracted.stdout);
  return {
    bytes: extracted.stdout.length,
    sha256: createHash("sha256").update(extracted.stdout).digest("hex"),
    ...integrity,
  };
}
