import { describe, it, expect } from "vitest";
import { commandName, isWriteCommand, isDangerousCommand } from "./safety";

describe("safety 命令分类", () => {
  it("普通读命令放行", () => {
    expect(isWriteCommand("get foo")).toBe(false);
    expect(isDangerousCommand("get foo")).toBe(false);
  });

  it("写命令被识别为写、非危险", () => {
    expect(isWriteCommand("set foo bar")).toBe(true);
    expect(isDangerousCommand("set foo bar")).toBe(false);
  });

  it("危险命令需确认且同属写", () => {
    expect(isDangerousCommand("flushall")).toBe(true);
    expect(isWriteCommand("flushall")).toBe(true);
  });

  // SLOWLOG 是复合命令：仅 RESET 危险，GET/LEN 只读放行（判定读第二个 token）
  describe("SLOWLOG 子命令感知", () => {
    it("slowlog get 只读放行", () => {
      expect(isWriteCommand("slowlog get")).toBe(false);
      expect(isDangerousCommand("slowlog get")).toBe(false);
    });

    it("slowlog get 带条数只读放行", () => {
      expect(isWriteCommand("slowlog get 128")).toBe(false);
      expect(isDangerousCommand("slowlog get 128")).toBe(false);
    });

    it("slowlog len 只读放行", () => {
      expect(isWriteCommand("slowlog len")).toBe(false);
      expect(isDangerousCommand("slowlog len")).toBe(false);
    });

    it("slowlog reset 危险且属写（只读拦截）", () => {
      expect(isDangerousCommand("slowlog reset")).toBe(true);
      expect(isWriteCommand("slowlog reset")).toBe(true);
    });

    it("大小写与多余空白不敏感", () => {
      expect(isDangerousCommand("SLOWLOG   RESET")).toBe(true);
      expect(isWriteCommand("  SLOWLOG GET ")).toBe(false);
    });
  });

  it("commandName 取首 token 小写", () => {
    expect(commandName("  SLOWLOG GET 10 ")).toBe("slowlog");
  });
});
