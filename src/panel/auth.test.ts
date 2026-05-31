import { describe, expect, it } from "vitest";
import {
  createLogoutCookie,
  createRoleCookie,
  getClientIp,
  getOrCreateAttendeeId,
  passcodeMatches,
  readAuthState,
  rolePasscodeConfigured,
  type PanelEnv,
} from "./auth";

const env: PanelEnv = {
  AUTH_SECRET: "test-secret",
  MC_PASSCODE: "mc-passcode",
  MODERATOR_PASSCODE: "mod-passcode",
};

describe("panel auth", () => {
  it("validates configured role passcodes and signed role cookies", async () => {
    expect(rolePasscodeConfigured("mc", env)).toBe(true);
    expect(rolePasscodeConfigured("moderator", { AUTH_SECRET: "test-secret" })).toBe(false);
    expect(await passcodeMatches("mc", "mc-passcode", env)).toBe(true);
    expect(await passcodeMatches("mc", "wrong", env)).toBe(false);

    const cookie = await createRoleCookie("mc", env, true);
    const request = new Request("https://example.com/mc", { headers: { cookie } });

    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).toMatch(/^panel_auth=mc\.[A-Za-z\d_-]+; HttpOnly; SameSite=Lax; Secure; Path=\/; Max-Age=604800$/u);
    await expect(readAuthState(request, env)).resolves.toEqual({ configured: true, role: "mc" });
    await expect(
      readAuthState(
        new Request("https://example.com/mc", {
          headers: { cookie: cookie.replace("panel_auth=mc.", "panel_auth=moderator.") },
        }),
        env,
      ),
    ).resolves.toEqual({
      configured: true,
    });
    await expect(
      readAuthState(new Request("https://example.com/mc", { headers: { cookie: "panel_auth=mc.invalid" } }), env),
    ).resolves.toEqual({
      configured: true,
    });
    await expect(
      readAuthState(new Request("https://example.com/mc", { headers: { cookie: "panel_auth=attendee.invalid" } }), env),
    ).resolves.toEqual({
      configured: true,
    });
    await expect(
      readAuthState(new Request("https://example.com/mc", { headers: { cookie: cookie.replace("mc.", "mcx.") } }), env),
    ).resolves.toEqual({
      configured: true,
    });
    await expect(passcodeMatches("mc", "nc-passcode", env)).resolves.toBe(false);
    await expect(passcodeMatches("mc", "mc-passcodex", env)).resolves.toBe(false);
  });

  it("treats missing auth secret as unconfigured", async () => {
    await expect(readAuthState(new Request("https://example.com/mc"), {})).resolves.toEqual({ configured: false });
    expect(rolePasscodeConfigured("moderator", { MODERATOR_PASSCODE: "mod" })).toBe(false);
  });

  it("creates an anonymous attendee cookie and reads client IP headers", () => {
    const request = new Request("http://example.com/", { headers: { "cf-connecting-ip": "203.0.113.10" } });
    const attendee = getOrCreateAttendeeId(request);

    expect(attendee.id).toMatch(/^[a-f\d-]{36}$/u);
    expect(attendee.cookie).toContain("panel_attendee=");
    expect(attendee.cookie).toContain("Max-Age=604800");
    expect(attendee.cookie).not.toContain("Secure");
    expect(
      getOrCreateAttendeeId(new Request("http://example.com/", { headers: { cookie: `other=1; panel_attendee=${attendee.id}` } })),
    ).toEqual({
      id: attendee.id,
    });
    expect(
      getOrCreateAttendeeId(new Request("http://example.com/", { headers: { cookie: `panel_attendee=prefix-${attendee.id}-suffix` } })).id,
    ).not.toBe(`prefix-${attendee.id}-suffix`);
    expect(
      getOrCreateAttendeeId(new Request("http://example.com/", { headers: { cookie: `panel_attendee=prefix-${attendee.id}` } })).id,
    ).not.toBe(`prefix-${attendee.id}`);
    expect(
      getOrCreateAttendeeId(new Request("http://example.com/", { headers: { cookie: `panel_attendee=${attendee.id}-suffix` } })).id,
    ).not.toBe(`${attendee.id}-suffix`);
    expect(
      getOrCreateAttendeeId(new Request("http://example.com/", { headers: { cookie: `panel_attendee=${attendee.id}=extra` } })).id,
    ).not.toBe(attendee.id);
    expect(getOrCreateAttendeeId(new Request("https://example.com/")).cookie).toContain("Secure");
    expect(getClientIp(request)).toBe("203.0.113.10");
    expect(getClientIp(new Request("http://example.com/", { headers: { "x-forwarded-for": " 198.51.100.4 , 198.51.100.5" } }))).toBe(
      "198.51.100.4",
    );
    expect(getClientIp(new Request("http://example.com/"))).toBe("local");
    expect(createLogoutCookie(true)).toContain("Secure");
    expect(createLogoutCookie(false)).not.toContain("Secure");
  });

  it("throws before creating a role cookie without an auth secret", async () => {
    await expect(createRoleCookie("mc", {}, false)).rejects.toThrow("AUTH_SECRET is required");
  });
});
