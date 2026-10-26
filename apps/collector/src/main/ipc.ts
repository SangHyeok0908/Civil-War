import {
  ClientError,
  object,
  text,
  ROLES,
} from "../../../../packages/contracts/src/index";
export const CHANNEL = "collector:command";
export type Command =
  | "account"
  | "snapshot"
  | "enroll"
  | "query"
  | "pending"
  | "confirm"
  | "resume"
  | "references"
  | "draft";
export function validSender(
  event: { senderId: number; frameUrl: string; isMainFrame: boolean },
  expectedId: number,
  expectedUrl: string,
) {
  return (
    event.senderId === expectedId &&
    event.isMainFrame &&
    event.frameUrl === expectedUrl
  );
}
export function validateCommand(
  command: unknown,
  input: unknown,
): { command: Command; payload: any } {
  if (
    typeof command !== "string" ||
    ![
      "account",
      "snapshot",
      "enroll",
      "query",
      "pending",
      "confirm",
      "resume",
      "references",
      "draft",
    ].includes(command)
  )
    throw new ClientError("INVALID_IPC");
  const p = object(input);
  const allowed =
    command === "enroll"
      ? ["code"]
      : command === "confirm"
        ? ["matchKey", "rolesByPuuid", "inhouse"]
        : command === "draft"
          ? ["matchKey", "rolesByPuuid"]
          : command === "references"
            ? ["selection"]
            : [];
  if (
    Object.keys(p).some((k) => !allowed.includes(k)) ||
    Object.keys(p).length !== allowed.length
  )
    throw new ClientError("INVALID_IPC");
  if (command === "enroll") text(p.code, 100);
  if (command === "confirm" || command === "draft") {
    if (
      !/^[A-Z0-9]{1,16}:\d{1,30}$/.test(text(p.matchKey, 47)) ||
      (command === "confirm" && p.inhouse !== true)
    )
      throw new ClientError("INVALID_IPC");
    const roles = object(p.rolesByPuuid);
    if (
      (command === "confirm"
        ? Object.keys(roles).length !== 10
        : Object.keys(roles).length > 10) ||
      Object.entries(roles).some(
        ([k, v]) => k.length > 255 || !ROLES.includes(v),
      )
    )
      throw new ClientError("INVALID_ROLES");
  }
  if (
    command === "references" &&
    (!Array.isArray(p.selection) ||
      p.selection.length > 30 ||
      p.selection.some((x: unknown) => typeof x !== "string" || x.length > 255))
  )
    throw new ClientError("INVALID_IPC");
  return { command: command as Command, payload: p };
}
