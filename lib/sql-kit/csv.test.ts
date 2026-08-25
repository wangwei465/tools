import { describe, it, expect } from "vitest";
import { parseCsv, CsvOptions } from "./csv";

const opts = (over: Partial<CsvOptions> = {}): CsvOptions => ({
  delimiter: ",",
  hasHeader: true,
  ...over,
});

describe("CSV 解析", () => {
  it("基本表头与数据行", () => {
    const r = parseCsv("id,name\n1,张三\n2,李四", opts());
    expect(r.ok).toBe(true);
    expect(r.value!.headers).toEqual(["id", "name"]);
    expect(r.value!.rows).toEqual([
      ["1", "张三"],
      ["2", "李四"],
    ]);
  });

  it("双引号包裹的字段内可含分隔符", () => {
    const r = parseCsv('id,name\n1,"张三, 李四"', opts());
    expect(r.value!.rows[0]).toEqual(["1", "张三, 李四"]);
  });

  it("双引号转义", () => {
    const r = parseCsv('id,note\n1,"他说""你好"""', opts());
    expect(r.value!.rows[0][1]).toBe('他说"你好"');
  });

  it("引号内的换行属于字段内容", () => {
    const r = parseCsv('id,note\n1,"第一行\n第二行"', opts());
    expect(r.value!.rows).toHaveLength(1);
    expect(r.value!.rows[0][1]).toBe("第一行\n第二行");
  });

  it("字段中间的引号按普通字符处理", () => {
    const r = parseCsv("id,note\n1,5\" 屏幕", opts());
    expect(r.value!.rows[0][1]).toBe('5" 屏幕');
  });

  it("兼容 CRLF 换行", () => {
    const r = parseCsv("id,name\r\n1,a\r\n2,b", opts());
    expect(r.value!.rows).toEqual([
      ["1", "a"],
      ["2", "b"],
    ]);
  });

  it("自定义分隔符：制表符", () => {
    const r = parseCsv("id\tname\n1\ta", opts({ delimiter: "\t" }));
    expect(r.value!.headers).toEqual(["id", "name"]);
    expect(r.value!.rows[0]).toEqual(["1", "a"]);
  });

  it("自定义分隔符：分号", () => {
    const r = parseCsv("id;name\n1;a", opts({ delimiter: ";" }));
    expect(r.value!.rows[0]).toEqual(["1", "a"]);
  });

  it("无表头时生成 colN 列名", () => {
    const r = parseCsv("1,a\n2,b", opts({ hasHeader: false }));
    expect(r.value!.headers).toEqual(["col1", "col2"]);
    expect(r.value!.rows).toHaveLength(2);
  });

  it("忽略末尾空行", () => {
    const r = parseCsv("id,name\n1,a\n\n", opts());
    expect(r.value!.rows).toEqual([["1", "a"]]);
  });

  it("空字段保留为空串", () => {
    const r = parseCsv("id,name\n1,", opts());
    expect(r.value!.rows[0]).toEqual(["1", ""]);
  });
});

describe("CSV 错误处理", () => {
  it("空输入报错", () => {
    expect(parseCsv("   ", opts()).ok).toBe(false);
  });

  it("只有表头时报错", () => {
    const r = parseCsv("id,name", opts());
    expect(r.ok).toBe(false);
    expect(r.error).toContain("没有数据行");
  });

  it("列数与表头不一致时报错并指出行号", () => {
    const r = parseCsv("id,name\n1,a\n2", opts());
    expect(r.ok).toBe(false);
    expect(r.error).toContain("第 3 行");
    expect(r.error).toContain("1 列");
    expect(r.error).toContain("2 列");
  });

  it("无表头模式下行号从 1 起算", () => {
    const r = parseCsv("1,a\n2", opts({ hasHeader: false }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("第 2 行");
  });

  it("表头有空列名时报错", () => {
    const r = parseCsv("id,,name\n1,2,3", opts());
    expect(r.ok).toBe(false);
    expect(r.error).toContain("空列名");
  });
});
