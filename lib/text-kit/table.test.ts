import { describe, it, expect } from "vitest";
import { parseTable, stringifyTable, convertTable, TableOptions } from "./table";

const opts = (over: Partial<TableOptions> = {}): TableOptions => ({
  delimiter: ",",
  hasHeader: true,
  ...over,
});

describe("三向互转", () => {
  it("CSV → JSON 以表头为键", () => {
    const r = convertTable("id,name\n1,张三", "csv", "json", opts());
    expect(JSON.parse(r.value!)).toEqual([{ id: "1", name: "张三" }]);
  });

  it("JSON → Markdown 含表头行与对齐行", () => {
    const r = convertTable('[{"id":1,"name":"张三"}]', "json", "markdown", opts());
    expect(r.value).toBe("| id | name |\n| --- | --- |\n| 1 | 张三 |");
  });

  it("Markdown → CSV", () => {
    const md = "| id | name |\n| --- | --- |\n| 1 | 张三 |";
    const r = convertTable(md, "markdown", "csv", opts());
    expect(r.value).toBe("id,name\n1,张三");
  });

  it("CSV → TSV 走分隔符设置", () => {
    const r = convertTable("id,name\n1,张三", "csv", "csv", opts());
    expect(r.value).toBe("id,name\n1,张三");
    const t = convertTable("id\tname\n1\t张三", "csv", "json", opts({ delimiter: "\t" }));
    expect(JSON.parse(t.value!)).toEqual([{ id: "1", name: "张三" }]);
  });
});

describe("JSON 侧的约定", () => {
  it("字段取并集，缺失留空", () => {
    const r = parseTable('[{"a":1},{"b":2}]', "json", opts());
    expect(r.value!.header).toEqual(["a", "b"]);
    expect(r.value!.rows).toEqual([
      ["1", ""],
      ["", "2"],
    ]);
  });

  it("嵌套值序列化为紧凑 JSON，不展开为多列", () => {
    const r = parseTable('[{"a":{"x":1},"b":[1,2]}]', "json", opts());
    expect(r.value!.header).toEqual(["a", "b"]);
    expect(r.value!.rows).toEqual([['{"x":1}', "[1,2]"]]);
  });

  it("null 转为空单元格", () => {
    const r = parseTable('[{"a":null}]', "json", opts());
    expect(r.value!.rows).toEqual([[""]]);
  });
});

describe("CSV 输出与表头开关", () => {
  it("关闭表头时不输出表头行", () => {
    const t = { header: ["id", "name"], rows: [["1", "张三"]] };
    expect(stringifyTable(t, "csv", opts({ hasHeader: false }))).toBe("1,张三");
  });

  it("含分隔符与引号的单元格被包裹转义", () => {
    const t = { header: ["a"], rows: [['x,y"z']] };
    expect(stringifyTable(t, "csv", opts())).toBe('a\n"x,y""z"');
  });
});

describe("Markdown 宽松解析", () => {
  it("缺失对齐行时第二行按数据行处理", () => {
    const r = parseTable("| id | name |\n| 1 | 张三 |", "markdown", opts());
    expect(r.value!.header).toEqual(["id", "name"]);
    expect(r.value!.rows).toEqual([["1", "张三"]]);
  });

  it("单元格数量不齐时按最长行补空", () => {
    const r = parseTable("| a | b |\n| --- | --- |\n| 1 |", "markdown", opts());
    expect(r.value!.rows).toEqual([["1", ""]]);
  });

  it("容忍缺失首尾竖线", () => {
    const r = parseTable("a | b\n--- | ---\n1 | 2", "markdown", opts());
    expect(r.value!.header).toEqual(["a", "b"]);
    expect(r.value!.rows).toEqual([["1", "2"]]);
  });

  it("转义竖线还原为字面量竖线", () => {
    const r = parseTable("| a |\n| --- |\n| x \\| y |", "markdown", opts());
    expect(r.value!.rows).toEqual([["x | y"]]);
  });

  it("输出时竖线被转义，往返不错位", () => {
    const md = stringifyTable({ header: ["a"], rows: [["x|y"]] }, "markdown", opts());
    const back = parseTable(md, "markdown", opts());
    expect(back.value!.rows).toEqual([["x|y"]]);
  });
});

describe("非法输入可读报错", () => {
  it("非法 JSON", () => {
    const r = parseTable("{不是 json", "json", opts());
    expect(r.ok).toBe(false);
    expect(r.error).toContain("JSON 解析失败");
  });

  it("JSON 非数组", () => {
    expect(parseTable('{"a":1}', "json", opts()).error).toContain("需为对象数组");
  });

  it("JSON 数组元素非对象", () => {
    expect(parseTable("[1,2]", "json", opts()).error).toContain("元素需为对象");
  });

  it("空 JSON 数组", () => {
    expect(parseTable("[]", "json", opts()).error).toContain("数组为空");
  });

  it("无法解析的 Markdown", () => {
    const r = parseTable("   ", "markdown", opts());
    expect(r.ok).toBe(false);
  });

  it("超深嵌套 JSON 被拒绝", () => {
    let deep = "1";
    for (let i = 0; i < 40; i += 1) deep = `[${deep}]`;
    const r = parseTable(`[{"a":${deep}}]`, "json", opts());
    expect(r.ok).toBe(false);
    expect(r.error).toContain("嵌套深度");
  });
});
