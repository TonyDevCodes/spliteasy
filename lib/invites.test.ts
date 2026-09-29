import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { invitePath, inviteUrl, joinGroupByToken, parseInviteToken, safeReturnPath } from "./invites";

const TOKEN = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

describe("parseInviteToken", () => {
  it("accepts a bare token", () => {
    expect(parseInviteToken(TOKEN)).toBe(TOKEN);
    expect(parseInviteToken(`  ${TOKEN}  `)).toBe(TOKEN);
  });

  it("extracts the token from paths and URLs", () => {
    expect(parseInviteToken(`/invite/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteToken(`spliteasy://invite/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteToken(`https://spliteasy-beta-five.vercel.app/invite/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteToken(`https://example.com/invite/${TOKEN}/?utm=x#top`)).toBe(TOKEN);
  });

  it("takes the first value of an array (expo-router params)", () => {
    expect(parseInviteToken([TOKEN, "other"])).toBe(TOKEN);
  });

  it("rejects empty, malformed and unsafe tokens", () => {
    expect(parseInviteToken(undefined)).toBeNull();
    expect(parseInviteToken(null)).toBeNull();
    expect(parseInviteToken("")).toBeNull();
    expect(parseInviteToken("/invite/")).toBeNull();
    expect(parseInviteToken("/invite/../groups")).toBeNull();
    expect(parseInviteToken("not a token")).toBeNull();
    expect(parseInviteToken("%E0%A4%A")).toBeNull();
    expect(parseInviteToken(`/groups/${TOKEN}/extra`)).toBeNull();
    expect(parseInviteToken("x".repeat(129))).toBeNull();
  });
});

describe("invitePath / inviteUrl", () => {
  it("builds the path and the shareable web URL", () => {
    expect(invitePath(TOKEN)).toBe(`/invite/${TOKEN}`);
    expect(inviteUrl("https://spliteasy-beta-five.vercel.app/", TOKEN)).toBe(
      `https://spliteasy-beta-five.vercel.app/invite/${TOKEN}`
    );
  });
});

describe("safeReturnPath", () => {
  it("allows only invite paths", () => {
    expect(safeReturnPath(`/invite/${TOKEN}`)).toBe(`/invite/${TOKEN}`);
    expect(safeReturnPath(`/invite/${TOKEN}?x=1`)).toBe(`/invite/${TOKEN}`);
  });

  it("rejects everything else", () => {
    expect(safeReturnPath("/groups/abc")).toBeNull();
    expect(safeReturnPath("https://evil.example/invite/abc")).toBeNull();
    expect(safeReturnPath("//evil.example")).toBeNull();
    expect(safeReturnPath("/invite/bad token")).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(42)).toBeNull();
  });
});

describe("joinGroupByToken", () => {
  const GROUP = "0b7e2d7a-1f1a-4c2e-9a53-6a8d4f0e9c11";

  function mockClient(result: { data: unknown; error: { message?: string } | null } | Error) {
    const rpc = vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    return { client: { rpc }, rpc };
  }

  it("joins through the RPC and returns the group id", async () => {
    const { client, rpc } = mockClient({ data: GROUP, error: null });
    expect(await joinGroupByToken(client, `spliteasy://invite/${TOKEN}`)).toEqual({ ok: true, groupId: GROUP });
    expect(rpc).toHaveBeenCalledWith("join_group_by_token", { p_token: TOKEN });
  });

  it("reports an invalid or expired invite", async () => {
    const invalid = await joinGroupByToken(mockClient({ data: null, error: { message: "invite_invalid" } }).client, TOKEN);
    expect(invalid).toEqual({ ok: false, reason: "invalid", message: "This invite link is invalid." });
    const expired = await joinGroupByToken(mockClient({ data: null, error: { message: "invite_expired" } }).client, TOKEN);
    expect(expired).toMatchObject({ ok: false, reason: "expired" });
  });

  it("reports a signed-out user", async () => {
    const result = await joinGroupByToken(mockClient({ data: null, error: { message: "not_authenticated" } }).client, TOKEN);
    expect(result).toMatchObject({ ok: false, reason: "not-signed-in" });
  });

  it("reports network errors, thrown or returned", async () => {
    const returned = await joinGroupByToken(mockClient({ data: null, error: { message: "TypeError: Network request failed" } }).client, TOKEN);
    expect(returned).toMatchObject({ ok: false, reason: "failed" });
    const thrown = await joinGroupByToken(mockClient(new Error("fetch failed")).client, TOKEN);
    expect(thrown).toMatchObject({ ok: false, reason: "failed" });
    const empty = await joinGroupByToken(mockClient({ data: null, error: null }).client, TOKEN);
    expect(empty).toMatchObject({ ok: false, reason: "failed" });
  });

  it("does not call the RPC for a malformed token", async () => {
    const { client, rpc } = mockClient({ data: GROUP, error: null });
    expect(await joinGroupByToken(client, "bad token!")).toMatchObject({ ok: false, reason: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

it("is identical in the mobile app", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
  expect(read("..", "mobile", "lib", "invites.ts")).toBe(read("invites.ts"));
});
