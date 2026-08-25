import { describe, it, expect } from "vitest";
import {
  scanPlaceholders,
  parseParams,
  renderParam,
  fillSql,
  splitLog,
  fillFromLog,
} from "./fill";

describe("占位符扫描", () => {
  it("普通占位符", () => {
    expect(scanPlaceholders("select * from t where id = ? and n = ?")).toHaveLength(2);
  });

  it("跳过单引号字符串内的问号", () => {
    const sql = "select * from t where name = 'a?b' and id = ?";
    expect(scanPlaceholders(sql)).toHaveLength(1);
  });

  it("跳过双引号与反引号内的问号", () => {
    expect(scanPlaceholders('select "a?b" from t where id = ?')).toHaveLength(1);
    expect(scanPlaceholders("select `a?b` from t where id = ?")).toHaveLength(1);
  });

  it("识别 '' 形式的引号转义", () => {
    // 'it''s ?' 是一个完整字符串，其中的 ? 不是占位符
    const sql = "select * from t where s = 'it''s ?' and id = ?";
    expect(scanPlaceholders(sql)).toHaveLength(1);
  });

  it("识别反斜杠转义", () => {
    const sql = "select * from t where s = 'a\\'? b' and id = ?";
    expect(scanPlaceholders(sql)).toHaveLength(1);
  });

  it("跳过行注释内的问号", () => {
    const sql = "select * from t -- 这里有个 ?\nwhere id = ?";
    expect(scanPlaceholders(sql)).toHaveLength(1);
  });

  it("跳过块注释内的问号", () => {
    const sql = "select /* ? ? ? */ * from t where id = ?";
    expect(scanPlaceholders(sql)).toHaveLength(1);
  });

  it("未闭合的字符串不会吞掉后续内容之外的东西", () => {
    // 未闭合引号后不应再产生占位符，避免误判
    expect(scanPlaceholders("select * from t where s = 'abc ? ")).toHaveLength(0);
  });

  it("无占位符时返回空", () => {
    expect(scanPlaceholders("select 1")).toEqual([]);
  });
});

describe("参数列表解析", () => {
  it("解析值与类型", () => {
    expect(parseParams("1(Integer), 张三(String)")).toEqual([
      { raw: "1", type: "Integer" },
      { raw: "张三", type: "String" },
    ]);
  });

  it("null 无类型标注", () => {
    expect(parseParams("1(Integer), null")).toEqual([
      { raw: "1", type: "Integer" },
      { raw: "null", type: "null" },
    ]);
  });

  it("值内含逗号时不被误切", () => {
    // 逗号只有在「前面是完整的 值(类型)」时才算分隔符
    expect(parseParams("hello, world(String), 1(Integer)")).toEqual([
      { raw: "hello, world", type: "String" },
      { raw: "1", type: "Integer" },
    ]);
  });

  it("无类型标注的裸值按字符串处理", () => {
    expect(parseParams("abc")).toEqual([{ raw: "abc", type: "" }]);
  });

  it("空参数行解析为空列表", () => {
    expect(parseParams("")).toEqual([]);
    expect(parseParams("   ")).toEqual([]);
  });

  it("带包名的类型标注", () => {
    expect(parseParams("2026-08-24(java.sql.Timestamp)")).toEqual([
      { raw: "2026-08-24", type: "java.sql.Timestamp" },
    ]);
  });
});

describe("参数渲染", () => {
  it("数值与布尔不加引号", () => {
    expect(renderParam({ raw: "1", type: "Integer" })).toBe("1");
    expect(renderParam({ raw: "1.5", type: "BigDecimal" })).toBe("1.5");
    expect(renderParam({ raw: "true", type: "Boolean" })).toBe("true");
  });

  it("字符串加单引号", () => {
    expect(renderParam({ raw: "张三", type: "String" })).toBe("'张三'");
    expect(renderParam({ raw: "2026-08-24 10:00:00", type: "Timestamp" })).toBe(
      "'2026-08-24 10:00:00'"
    );
  });

  it("值内单引号被转义为两个", () => {
    expect(renderParam({ raw: "it's", type: "String" })).toBe("'it''s'");
  });

  it("null 原样输出且不加引号", () => {
    expect(renderParam({ raw: "null", type: "null" })).toBe("null");
    expect(renderParam({ raw: "null", type: "String" })).toBe("null");
  });

  it("无类型标注按字符串处理", () => {
    expect(renderParam({ raw: "abc", type: "" })).toBe("'abc'");
  });
});

describe("SQL 填充", () => {
  it("按顺序代入参数", () => {
    const r = fillSql("select * from t where id = ? and name = ?", "1(Integer), 张三(String)");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("select * from t where id = 1 and name = '张三'");
  });

  it("字符串内的问号不参与填充", () => {
    const r = fillSql("select * from t where s = 'a?b' and id = ?", "7(Integer)");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("select * from t where s = 'a?b' and id = 7");
  });

  it("注释内的问号不参与填充", () => {
    const r = fillSql("select * from t /* ? */ where id = ?", "7(Integer)");
    expect(r.value).toBe("select * from t /* ? */ where id = 7");
  });

  it("多个参数位置正确（含变长替换）", () => {
    // 第一个参数替换后长度变化，后面的占位符位置不能因此错位
    const r = fillSql("select ?, ?, ?", "1(Integer), 一个很长的字符串值(String), 2(Integer)");
    expect(r.value).toBe("select 1, '一个很长的字符串值', 2");
  });

  it("null 参数填充", () => {
    const r = fillSql("update t set a = ? where id = ?", "null, 1(Integer)");
    expect(r.value).toBe("update t set a = null where id = 1");
  });

  it("值内单引号被转义", () => {
    const r = fillSql("select * from t where s = ?", "it's(String)");
    expect(r.value).toBe("select * from t where s = 'it''s'");
  });

  it("参数偏少时硬报错并给出两侧数量", () => {
    const r = fillSql("select * from t where a = ? and b = ?", "1(Integer)");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("2 个 ?");
    expect(r.error).toContain("1 个");
    expect(r.value).toBeUndefined();
  });

  it("参数偏多时同样报错", () => {
    const r = fillSql("select * from t where a = ?", "1(Integer), 2(Integer)");
    expect(r.ok).toBe(false);
  });

  it("无占位符且无参数时原样返回", () => {
    const r = fillSql("select 1", "");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("select 1");
  });

  it("空 SQL 报错", () => {
    expect(fillSql("  ", "1(Integer)").ok).toBe(false);
  });
});

describe("日志拆分", () => {
  const LOG = `2026-08-24 10:00:00.123 DEBUG c.e.m.UserMapper.selectById - ==>  Preparing: select id, name from user where id = ? and status = ?
2026-08-24 10:00:00.125 DEBUG c.e.m.UserMapper.selectById - ==> Parameters: 42(Integer), ACTIVE(String)
2026-08-24 10:00:00.130 DEBUG c.e.m.UserMapper.selectById - <==      Total: 1`;

  it("从整段日志提取 SQL 与参数", () => {
    const r = splitLog(LOG);
    expect(r.ok).toBe(true);
    expect(r.value!.sql).toBe("select id, name from user where id = ? and status = ?");
    expect(r.value!.params).toBe("42(Integer), ACTIVE(String)");
  });

  it("一步得到填充结果", () => {
    const r = fillFromLog(LOG);
    expect(r.ok).toBe(true);
    expect(r.value).toBe("select id, name from user where id = 42 and status = 'ACTIVE'");
  });

  it("缺少 Parameters 行时按空参数处理", () => {
    const r = splitLog("==>  Preparing: select 1");
    expect(r.ok).toBe(true);
    expect(r.value!.params).toBe("");
  });

  it("缺少 Preparing 行时报错", () => {
    const r = splitLog("==> Parameters: 1(Integer)");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Preparing");
  });

  it("空输入报错", () => {
    expect(splitLog("   ").ok).toBe(false);
  });

  it("Preparing 行为空时报错", () => {
    expect(splitLog("==>  Preparing:   \n==> Parameters: ").ok).toBe(false);
  });
});
