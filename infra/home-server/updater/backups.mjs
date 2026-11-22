const BACKUP_NAME = /^\d{8}-\d{6}-[0-9a-z]+\.dump$/;

export function isBackupName(name) {
  return BACKUP_NAME.test(name);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function backupFileName(at, revision) {
  const stamp =
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `-${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`;
  const short = revision ? revision.slice(0, 7) : "unknown";
  return `${stamp}-${short}.dump`;
}

export function selectBackupsToDelete(names, keep) {
  const backups = names.filter((name) => BACKUP_NAME.test(name)).sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}
