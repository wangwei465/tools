import { describe, it, expect } from "vitest";
import {
  aggregateIndexRows,
  injectLimit,
  metaNumber,
  metaText,
  parseRdbUri,
  serializeRdbValue,
  serializeRows,
  shouldInjectLimit,
  toColumnInfo,
  toTableInfo,
} from "./rdb";
import { classifySqlOperation } from "./sql-classify";
import type { DatastoreConnection } from "./types";

/** 用真实分类结果驱动，避免测试与分类口径脱节。 */
const inject = (sql: string) => shouldInjectLimit(sql, classifySqlOperation(sql));

describe("shouldInjectLimit", () => {
  describe("触发", () => {
    it("裸 SELECT 注入", () => {
      expect(inject("SELECT * FROM t")).toBe(true);
    });

    it("带 WHERE / ORDER BY 的裸 SELECT 仍注入", () => {
      expect(inject("SELECT a, b FROM t WHERE id > 1 ORDER BY id DESC")).toBe(true);
    });

    it("以 WITH 开头的只读 CTE 注入", () => {
      expect(inject("WITH x AS (SELECT 1 AS n) SELECT * FROM x")).toBe(true);
    });

    it("结尾分号不影响注入判定", () => {
      expect(inject("SELECT * FROM t;")).toBe(true);
    });
  });

  describe("不触发", () => {
    it("已有 LIMIT 时不改写", () => {
      expect(inject("SELECT * FROM t LIMIT 10")).toBe(false);
    });

    it("已有 OFFSET / FETCH 时不改写", () => {
      expect(inject("SELECT * FROM t ORDER BY id OFFSET 10 ROWS")).toBe(false);
      expect(inject("SELECT * FROM t ORDER BY id FETCH FIRST 10 ROWS ONLY")).toBe(false);
    });

    it("含 FOR UPDATE 时不改写", () => {
      expect(inject("SELECT * FROM t WHERE id = 1 FOR UPDATE")).toBe(false);
    });

    it("含 INTO 时不改写", () => {
      expect(inject("SELECT * INTO backup FROM t")).toBe(false);
    });

    it("非 SELECT 语句不改写", () => {
      expect(inject("UPDATE t SET a = 1 WHERE id = 1")).toBe(false);
      expect(inject("SHOW TABLES")).toBe(false);
      expect(inject("EXPLAIN SELECT * FROM t")).toBe(false);
      expect(inject("DELETE FROM t")).toBe(false);
    });

    it("多条语句不改写", () => {
      expect(inject("SELECT * FROM t; SELECT * FROM u")).toBe(false);
    });

    it("子查询里的 LIMIT 不算已有上限（顶层仍无限制）", () => {
      expect(inject("SELECT * FROM (SELECT id FROM t LIMIT 5) AS s")).toBe(true);
    });
  });
});

describe("injectLimit", () => {
  it("追加在语句末尾", () => {
    expect(injectLimit("SELECT * FROM t", 500)).toBe("SELECT * FROM t LIMIT 500");
  });

  it("结尾分号之前追加，不产出非法语句", () => {
    expect(injectLimit("SELECT * FROM t;", 500)).toBe("SELECT * FROM t LIMIT 500;");
    expect(injectLimit("SELECT * FROM t ;  ", 500)).toBe("SELECT * FROM t LIMIT 500 ;  ");
  });

  it("尾部注释被保留在 LIMIT 之后（注释不参与定位）", () => {
    expect(injectLimit("SELECT * FROM t -- 备注", 100)).toBe("SELECT * FROM t LIMIT 100 -- 备注");
  });

  it("字面量里的分号不被当成语句结尾", () => {
    expect(injectLimit("SELECT ';' AS s FROM t", 10)).toBe("SELECT ';' AS s FROM t LIMIT 10");
  });
});

describe("serializeRdbValue", () => {
  it("null 与 undefined 归一为 null（由 UI 区分 NULL 与空串）", () => {
    expect(serializeRdbValue(null)).toBeNull();
    expect(serializeRdbValue(undefined)).toBeNull();
    expect(serializeRdbValue("")).toBe("");
  });

  it("BigInt 转字符串，不丢精度", () => {
    expect(serializeRdbValue(9007199254740993n)).toBe("9007199254740993");
  });

  it("超出安全整数范围的 number 转字符串", () => {
    // 2^53 + 2 是超出安全范围但仍可精确表示的值，用它才测得到判定本身
    expect(serializeRdbValue(2 ** 53 + 2)).toBe("9007199254740994");
  });

  it("安全范围内的整数与小数原样保留", () => {
    expect(serializeRdbValue(42)).toBe(42);
    expect(serializeRdbValue(3.14)).toBe(3.14);
  });

  it("字符串与布尔原样保留（时间列由驱动以原始文本返回）", () => {
    expect(serializeRdbValue("2026-08-27 10:00:00")).toBe("2026-08-27 10:00:00");
    expect(serializeRdbValue(true)).toBe(true);
  });

  it("Date 转 ISO 文本", () => {
    expect(serializeRdbValue(new Date("2026-08-27T02:00:00.000Z"))).toBe(
      "2026-08-27T02:00:00.000Z"
    );
  });

  it("二进制转 hex 摘要 + 字节长度", () => {
    expect(serializeRdbValue(Buffer.from([0xde, 0xad, 0xbe, 0xef]))).toBe(
      "0xdeadbeef (4 bytes)"
    );
  });

  it("超长二进制只留前若干字节的摘要", () => {
    const out = serializeRdbValue(Buffer.alloc(64, 0xab)) as string;
    expect(out).toContain("…");
    expect(out).toContain("(64 bytes)");
  });

  it("数组与对象递归序列化（PG 的 json / array 列）", () => {
    expect(serializeRdbValue([1n, null, "x"])).toEqual(["1", null, "x"]);
    expect(serializeRdbValue({ id: 9007199254740993n, name: null })).toEqual({
      id: "9007199254740993",
      name: null,
    });
  });

  it("serializeRows 逐行逐列处理", () => {
    expect(serializeRows([{ id: 1n, v: null }])).toEqual([{ id: "1", v: null }]);
  });
});

describe("parseRdbUri", () => {
  const conn = (uri: string, type: "mysql" | "postgres" = "mysql") =>
    ({ uri, type }) as DatastoreConnection;

  it("拆出主机、端口与库名", () => {
    expect(parseRdbUri(conn("mysql://127.0.0.1:3307/shop"))).toEqual({
      host: "127.0.0.1",
      port: 3307,
      database: "shop",
    });
  });

  it("缺端口时取该类型的默认端口", () => {
    expect(parseRdbUri(conn("mysql://localhost/shop")).port).toBe(3306);
    expect(parseRdbUri(conn("postgres://localhost/shop", "postgres")).port).toBe(5432);
  });

  it("库名做 URL 解码", () => {
    expect(parseRdbUri(conn("mysql://h:3306/my%20db")).database).toBe("my db");
  });

  it("空连接串与非法形态直接报错，不静默兜底", () => {
    expect(() => parseRdbUri(conn("   "))).toThrow("不能为空");
    expect(() => parseRdbUri(conn("not-a-uri"))).toThrow("格式不正确");
  });
});

describe("目录行映射", () => {
  it("metaText 兼容大小写列名，缺失归一为空串", () => {
    expect(metaText({ TABLE_NAME: "orders" }, "table_name", "TABLE_NAME")).toBe("orders");
    expect(metaText({ table_comment: null }, "table_comment")).toBe("");
  });

  it("metaNumber 取不到时为 null，区分零行与未知", () => {
    expect(metaNumber({ TABLE_ROWS: 0 }, "TABLE_ROWS")).toBe(0);
    expect(metaNumber({ TABLE_ROWS: null }, "TABLE_ROWS")).toBeNull();
  });

  it("toTableInfo 区分表与视图", () => {
    expect(
      toTableInfo({ TABLE_NAME: "orders", TABLE_TYPE: "BASE TABLE", TABLE_ROWS: 120 })
    ).toEqual({ name: "orders", type: "table", rowCount: 120, comment: "" });

    expect(toTableInfo({ table_name: "v_orders", table_type: "VIEW" })).toMatchObject({
      name: "v_orders",
      type: "view",
      rowCount: null,
    });
  });

  it("toColumnInfo 映射可空性、默认值与主键", () => {
    expect(
      toColumnInfo({
        COLUMN_NAME: "id",
        COLUMN_TYPE: "bigint(20)",
        IS_NULLABLE: "NO",
        COLUMN_DEFAULT: null,
        IS_PRIMARY: 1,
        COLUMN_COMMENT: "主键",
      })
    ).toEqual({
      name: "id",
      dataType: "bigint(20)",
      nullable: false,
      defaultValue: null,
      primaryKey: true,
      comment: "主键",
    });
  });

  it("无注释与无默认值时不报错，留空而非抛异常", () => {
    const col = toColumnInfo({ column_name: "name", data_type: "varchar", is_nullable: "YES" });
    expect(col).toMatchObject({ nullable: true, defaultValue: null, comment: "", primaryKey: false });
  });

  it("默认值为空串时保留空串（与「无默认值」区分）", () => {
    expect(toColumnInfo({ column_name: "a", column_default: "" }).defaultValue).toBe("");
  });

  it("aggregateIndexRows 按索引名聚合并保持列序", () => {
    expect(
      aggregateIndexRows([
        { INDEX_NAME: "idx_a_b", COLUMN_NAME: "b", SEQ_IN_INDEX: 2, IS_UNIQUE: 0 },
        { INDEX_NAME: "idx_a_b", COLUMN_NAME: "a", SEQ_IN_INDEX: 1, IS_UNIQUE: 0 },
        { INDEX_NAME: "PRIMARY", COLUMN_NAME: "id", SEQ_IN_INDEX: 1, IS_UNIQUE: 1 },
      ])
    ).toEqual([
      { name: "idx_a_b", columns: ["a", "b"], unique: false },
      { name: "PRIMARY", columns: ["id"], unique: true },
    ]);
  });

  it("唯一性用 't' / true 等形态表示时同样识别", () => {
    expect(
      aggregateIndexRows([{ index_name: "uk", column_name: "c", seq_in_index: 1, is_unique: "t" }])
    ).toEqual([{ name: "uk", columns: ["c"], unique: true }]);
  });

  it("无索引名的行被忽略，不产出空名索引", () => {
    expect(aggregateIndexRows([{ column_name: "x" }])).toEqual([]);
  });
});
