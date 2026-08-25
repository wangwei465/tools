import { describe, it, expect } from "vitest";
import { buildInsert, InsertOptions } from "./insert";

const opts = (over: Partial<InsertOptions> = {}): InsertOptions => ({
  table: "user",
  format: "csv",
  output: "multi",
  delimiter: ",",
  hasHeader: true,
  ...over,
});

describe("由 CSV 生成 INSERT", () => {
  it("每行一条语句", () => {
    const r = buildInsert("id,name\n1,张三\n2,李四", opts());
    expect(r.ok).toBe(true);
    expect(r.value).toBe(
      "INSERT INTO user (id, name) VALUES (1, '张三');\n" +
        "INSERT INTO user (id, name) VALUES (2, '李四');"
    );
  });

  it("单条多值形式", () => {
    const r = buildInsert("id,name\n1,a\n2,b", opts({ output: "single" }));
    expect(r.value).toBe("INSERT INTO user (id, name) VALUES\n  (1, 'a'),\n  (2, 'b');");
  });

  it("数值不加引号，字符串加引号", () => {
    const r = buildInsert("id,name,score\n1,a,9.5", opts());
    expect(r.value).toContain("(1, 'a', 9.5)");
  });

  it("布尔不加引号", () => {
    const r = buildInsert("id,active\n1,true\n2,FALSE", opts());
    expect(r.value).toContain("(1, true)");
    expect(r.value).toContain("(2, false)");
  });

  it("空值输出为 null", () => {
    const r = buildInsert("id,name\n1,", opts());
    expect(r.value).toContain("(1, null)");
  });

  it("字面量 null 输出为 null", () => {
    const r = buildInsert("id,name\n1,null", opts());
    expect(r.value).toContain("(1, null)");
  });

  it("前导零的编号按字符串处理，不丢前导零", () => {
    // 0012345 是订单号而非数值，当成数字输出会静默变成 12345
    const r = buildInsert("id,code\n1,0012345", opts());
    expect(r.value).toContain("'0012345'");
  });

  it("值内单引号被转义", () => {
    const r = buildInsert("id,name\n1,it's", opts());
    expect(r.value).toContain("'it''s'");
  });

  it("无表头时用 colN 作列名", () => {
    const r = buildInsert("1,a", opts({ hasHeader: false }));
    expect(r.value).toContain("(col1, col2)");
  });

  it("自定义分隔符", () => {
    const r = buildInsert("id\tname\n1\ta", opts({ delimiter: "\t" }));
    expect(r.value).toContain("(1, 'a')");
  });

  it("含特殊字符的列名与表名被反引号包裹", () => {
    const r = buildInsert("user id,name\n1,a", opts({ table: "my table" }));
    expect(r.value).toContain("`my table`");
    expect(r.value).toContain("`user id`");
  });
});

describe("由 JSON 生成 INSERT", () => {
  const json = '[{"id":1,"name":"张三"},{"id":2,"name":"李四"}]';

  it("对象数组生成语句", () => {
    const r = buildInsert(json, opts({ format: "json" }));
    expect(r.ok).toBe(true);
    expect(r.value).toContain("INSERT INTO user (id, name) VALUES (1, '张三');");
  });

  it("JSON 类型直接决定引号", () => {
    const r = buildInsert('[{"a":1,"b":"1","c":true,"d":null}]', opts({ format: "json" }));
    expect(r.value).toContain("(1, '1', true, null)");
  });

  it("字段不齐时以并集为列，缺失补 null", () => {
    const r = buildInsert('[{"a":1},{"b":2}]', opts({ format: "json" }));
    expect(r.value).toContain("(a, b)");
    expect(r.value).toContain("(1, null)");
    expect(r.value).toContain("(null, 2)");
  });

  it("嵌套对象序列化为 JSON 字符串", () => {
    const r = buildInsert('[{"a":{"x":1}}]', opts({ format: "json" }));
    expect(r.value).toContain(`'{"x":1}'`);
  });

  it("单条多值形式", () => {
    const r = buildInsert(json, opts({ format: "json", output: "single" }));
    expect(r.value).toContain("VALUES\n  (1, '张三'),\n  (2, '李四');");
  });
});

describe("INSERT 错误分类", () => {
  it("表名缺失", () => {
    const r = buildInsert("id\n1", opts({ table: "  " }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("表名");
  });

  it("JSON 非法", () => {
    const r = buildInsert("{ 坏掉的 json", opts({ format: "json" }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("JSON 解析失败");
  });

  it("JSON 不是数组", () => {
    const r = buildInsert('{"a":1}', opts({ format: "json" }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("必须是数组");
  });

  it("JSON 数组为空", () => {
    const r = buildInsert("[]", opts({ format: "json" }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("为空");
  });

  it("JSON 数组元素不是对象", () => {
    const r = buildInsert('[{"a":1}, 2]', opts({ format: "json" }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("第 2 项");
  });

  it("CSV 列数不一致", () => {
    const r = buildInsert("id,name\n1", opts());
    expect(r.ok).toBe(false);
    expect(r.error).toContain("不一致");
  });

  it("错误时不产出半成品语句", () => {
    expect(buildInsert("[]", opts({ format: "json" })).value).toBeUndefined();
  });
});
