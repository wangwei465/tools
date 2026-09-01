import { describe, it, expect } from "vitest";
import { beautify, minify, DIALECTS, DEFAULT_DIALECT } from "./format";

describe("SQL 美化", () => {
  it("单行 SQL 展开为多行", () => {
    const r = beautify("select a,b from t where id=1", "mysql");
    expect(r.ok).toBe(true);
    expect(r.value!.split("\n").length).toBeGreaterThan(1);
    expect(r.value).toContain("select");
    expect(r.value).toContain("from");
  });

  it("保留字符串字面量内容", () => {
    const r = beautify("select * from t where s = 'a  b'", "mysql");
    expect(r.value).toContain("'a  b'");
  });

  it("方言可切换", () => {
    for (const d of DIALECTS) {
      const r = beautify("select 1", d.value);
      expect(r.ok).toBe(true);
    }
  });

  it("默认方言可用", () => {
    expect(beautify("select 1", DEFAULT_DIALECT).ok).toBe(true);
  });

  it("空输入报错", () => {
    expect(beautify("   ", "mysql").ok).toBe(false);
  });

  it("无法解析时返回可读错误而非抛异常", () => {
    // sql-formatter 对无法词法分析的输入会抛异常，这里必须被接住
    const r = beautify("!!! not sql @@@", "mysql");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("无法格式化");
    expect(r.value).toBeUndefined();
  });
});

describe("SQL 压缩", () => {
  it("多行折叠为单行", () => {
    const r = minify("select\n  a,\n  b\nfrom\n  t");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("select a, b from t");
  });

  it("字符串内的空白被原样保留", () => {
    const r = minify("select * from t\nwhere s = 'a   b'");
    expect(r.value).toBe("select * from t where s = 'a   b'");
  });

  it("字符串内的换行被原样保留", () => {
    const r = minify("select 'a\nb' from t");
    expect(r.value).toBe("select 'a\nb' from t");
  });

  it("行注释被移除且不产生词粘连", () => {
    const r = minify("select a -- 注释\nfrom t");
    expect(r.value).toBe("select a from t");
  });

  it("块注释被移除", () => {
    const r = minify("select /* 注释 */ a from t");
    expect(r.value).toBe("select a from t");
  });

  it("注释内的引号不破坏后续解析", () => {
    const r = minify("select a -- it's fine\nfrom t where x = 1");
    expect(r.value).toBe("select a from t where x = 1");
  });

  it("空输入报错", () => {
    expect(minify("   ").ok).toBe(false);
  });

  // 分段器刻意不把 # 当行注释：当成注释会把 #> 之后的语句整段吃掉
  it("PG 的 #> / #>> JSON 运算符不被当成行注释吃掉", () => {
    const r = minify("select data #> '{a,b}' as v from t where id = 1");
    expect(r.value).toBe("select data #> '{a,b}' as v from t where id = 1");
  });

  it("PG 美元引用内的空白按字面量保留", () => {
    const r = minify("select $$a  b$$ as s from t");
    expect(r.value).toBe("select $$a  b$$ as s from t");
  });

  it("压缩结果可再被美化", () => {
    const compact = minify("select\n  a\nfrom t where s = 'x  y'").value!;
    const pretty = beautify(compact, "mysql");
    expect(pretty.ok).toBe(true);
    expect(pretty.value).toContain("'x  y'");
  });
});
