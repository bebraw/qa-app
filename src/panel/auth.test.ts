import { describe, expect, it } from "vitest";
import {
  createLogoutCookies,
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
    expect(cookie).toMatch(/^panel_auth_mc=mc\.[A-Za-z\d_-]+; HttpOnly; SameSite=Lax; Secure; Path=\/; Max-Age=604800$/u);
    await expect(readAuthState(request, env)).resolves.toEqual({ configured: true, role: "mc" });
    await expect(
      readAuthState(
        new Request("https://example.com/mc", {
          headers: { cookie: cookie.replace("panel_auth_mc=mc.", "panel_auth_mc=moderator.") },
        }),
        env,
      ),
    ).resolves.toEqual({
      configured: true,
    });
    await expect(
      readAuthState(new Request("https://example.com/mc", { headers: { cookie: "panel_auth_mc=mc.invalid" } }), env),
    ).resolves.toEqual({
      configured: true,
    });
    await expect(
      readAuthState(new Request("https://example.com/mc", { headers: { cookie: "panel_auth_mc=attendee.invalid" } }), env),
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

  it("keeps MC and moderator cookies scoped to their own role routes", async () => {
    const mcCookie = await createRoleCookie("mc", env, false);
    const moderatorCookie = await createRoleCookie("moderator", env, false);
    const sharedCookie = `${mcCookie.split(";")[0]}; ${moderatorCookie.split(";")[0]}`;

    expect(moderatorCookie).toMatch(/^panel_auth_moderator=moderator\.[A-Za-z\d_-]+;/u);
    await expect(readAuthState(new Request("https://example.com/mc", { headers: { cookie: sharedCookie } }), env)).resolves.toEqual({
      configured: true,
      role: "mc",
    });
    await expect(readAuthState(new Request("https://example.com/mc/live", { headers: { cookie: sharedCookie } }), env)).resolves.toEqual({
      configured: true,
      role: "mc",
    });
    await expect(readAuthState(new Request("https://example.com/moderate", { headers: { cookie: sharedCookie } }), env)).resolves.toEqual({
      configured: true,
      role: "moderator",
    });
    await expect(
      readAuthState(new Request("https://example.com/moderate/live", { headers: { cookie: sharedCookie } }), env),
    ).resolves.toEqual({
      configured: true,
      role: "moderator",
    });
    await expect(readAuthState(new Request("https://example.com/mc", { headers: { cookie: moderatorCookie } }), env)).resolves.toEqual({
      configured: true,
    });
    await expect(readAuthState(new Request("https://example.com/moderate", { headers: { cookie: mcCookie } }), env)).resolves.toEqual({
      configured: true,
    });
  });

  it("treats missing auth secret as unconfigured", async () => {
    await expect(readAuthState(new Request("https://example.com/mc"), {})).resolves.toEqual({ configured: false });
    expect(rolePasscodeConfigured("moderator", { MODERATOR_PASSCODE: "mod" })).toBe(false);
  });

  it("creates an anonymous attendee cookie and reads Cloudflare client IP headers", () => {
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
    expect(getClientIp(new Request("http://example.com/", { headers: { "x-forwarded-for": "198.51.100.4" } }))).toBe("local");
    expect(getClientIp(new Request("http://example.com/"))).toBe("local");
    expect(createLogoutCookies(true)).toEqual([
      "panel_auth_mc=; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0",
      "panel_auth_moderator=; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0",
    ]);
    expect(createLogoutCookies(false).join("\n")).not.toContain("Secure");
  });

  it("throws before creating a role cookie without an auth secret", async () => {
    await expect(createRoleCookie("mc", {}, false)).rejects.toThrow("AUTH_SECRET is required");
  });
});
