import { describe, it, expect } from "vitest";
import { parseCsvTable, CsvOptions } from "./csv";

const opts = (over: Partial<CsvOptions> = {}): CsvOptions => ({
  delimiter: ",",
  hasHeader: true,
  ...over,
});

describe("共享 CSV 解析", () => {
  it("引号包裹的字段可含分隔符", () => {
    const t = parseCsvTable('id,name\n1,"张三,李四"', opts());
    expect(t.rows).toEqual([["1", "张三,李四"]]);
  });

  it("两个双引号转义为一个", () => {
    const t = parseCsvTable('id,note\n1,"他说""好"""', opts());
    expect(t.rows).toEqual([["1", '他说"好"']]);
  });

  it("引号内的换行保留在字段中", () => {
    const t = parseCsvTable('id,note\n1,"第一行\n第二行"', opts());
    expect(t.rows).toEqual([["1", "第一行\n第二行"]]);
  });

  it("切换分隔符为制表符", () => {
    const t = parseCsvTable("id\tname\n1\t张三", opts({ delimiter: "\t" }));
    expect(t.headers).toEqual(["id", "name"]);
    expect(t.rows).toEqual([["1", "张三"]]);
  });

  it("关闭表头时列名按 colN 生成且首行计入数据", () => {
    const t = parseCsvTable("1,张三\n2,李四", opts({ hasHeader: false }));
    expect(t.headers).toEqual(["col1", "col2"]);
    expect(t.rows).toHaveLength(2);
  });

  it("失败时抛出带可读 message 的错误", () => {
    expect(() => parseCsvTable("   ", opts())).toThrow("请输入 CSV 内容");
    expect(() => parseCsvTable("id,name\n1", opts())).toThrow("第 2 行有 1 列");
  });
});
