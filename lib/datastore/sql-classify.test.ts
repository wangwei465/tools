import { describe, it, expect } from "vitest";
import {
  analyzeSql,
  classifySqlOperation,
  rejectMultiStatement,
  stripSqlNoise,
} from "./sql-classify";

describe("stripSqlNoise", () => {
  it("剥离结果与原文等长（LIMIT 注入依赖下标一一对应）", () => {
    const sql = "SELECT /* c */ a FROM t -- tail\nWHERE x = 'v'";
    expect(stripSqlNoise(sql).length).toBe(sql.length);
  });

  it("含非 BMP 字符时仍等长（按码元切分，不按码点）", () => {
    const sql = "SELECT '🎉 完成' AS s FROM t";
    expect(stripSqlNoise(sql).length).toBe(sql.length);
    expect(stripSqlNoise(sql)).toContain("AS s FROM t");
  });

  it("行注释、块注释、字面量与引号标识符都被抹平", () => {
    const stripped = stripSqlNoise("SELECT `a`, \"b\", 'c' /* x */ -- y\nFROM t # z");
    expect(stripped).not.toContain("x");
    expect(stripped).not.toContain("y");
    expect(stripped).not.toContain("z");
    expect(stripped).toContain("SELECT");
    expect(stripped).toContain("FROM t");
  });

  it("PG 美元引用被当作字面量剥离", () => {
    expect(stripSqlNoise("SELECT $$ DROP TABLE t $$ AS s")).not.toContain("DROP");
  });

  it("# 行注释在分类侧被剥离（共享分段器不认，此处补认）", () => {
    expect(stripSqlNoise("SELECT 1 # DROP TABLE t")).not.toContain("DROP");
  });

  it("# 之后的换行仍保留，下一行不受影响", () => {
    expect(stripSqlNoise("# c\nSELECT 1")).toContain("\nSELECT 1");
  });
});

describe("rejectMultiStatement", () => {
  it("分号拼接的多语句被拒绝", () => {
    const r = rejectMultiStatement("SELECT 1; DROP TABLE t");
    expect(r).toContain("一次只能执行一条");
  });

  it("结尾分号不算多语句", () => {
    expect(rejectMultiStatement("SELECT 1;")).toBeNull();
    expect(rejectMultiStatement("SELECT 1;  \n ")).toBeNull();
  });

  it("字面量中的分号不构成多语句", () => {
    expect(rejectMultiStatement("SELECT '; DROP TABLE t' AS s")).toBeNull();
    expect(analyzeSql("SELECT '; DROP TABLE t' AS s").statementCount).toBe(1);
  });

  it("注释中的分号不构成多语句", () => {
    expect(rejectMultiStatement("SELECT 1 -- ; DROP TABLE t")).toBeNull();
    expect(rejectMultiStatement("SELECT 1 /* ; DROP TABLE t */")).toBeNull();
  });

  it("三条语句照样拒绝并报出条数", () => {
    expect(rejectMultiStatement("SELECT 1; SELECT 2; SELECT 3")).toContain("3 条语句");
  });
});

describe("classifySqlOperation", () => {
  describe("只读", () => {
    it("SELECT / SHOW / DESCRIBE 只读", () => {
      expect(classifySqlOperation("SELECT * FROM t WHERE id = 1")).toMatchObject({
        write: false,
        dangerous: false,
      });
      expect(classifySqlOperation("SHOW TABLES")).toMatchObject({ write: false });
      expect(classifySqlOperation("DESCRIBE orders")).toMatchObject({ write: false });
      expect(classifySqlOperation("DESC orders")).toMatchObject({ write: false });
    });

    it("EXPLAIN SELECT 只读", () => {
      expect(classifySqlOperation("EXPLAIN SELECT * FROM t")).toMatchObject({
        write: false,
        dangerous: false,
      });
      expect(classifySqlOperation("EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM t")).toMatchObject({
        write: false,
      });
    });

    it("CTE 查询只读", () => {
      expect(
        classifySqlOperation("WITH x AS (SELECT id FROM a) SELECT * FROM x")
      ).toMatchObject({ write: false, dangerous: false });
    });

    it("大小写与前导空白不敏感", () => {
      expect(classifySqlOperation("  \n select 1 ")).toMatchObject({ write: false });
    });
  });

  describe("写", () => {
    it("INSERT 为普通写", () => {
      const cls = classifySqlOperation("INSERT INTO t (a) VALUES (1)");
      expect(cls).toMatchObject({ write: true, dangerous: false });
    });

    it("带 WHERE 的 UPDATE 为普通写", () => {
      expect(classifySqlOperation("UPDATE t SET a = 1 WHERE id = 1")).toMatchObject({
        write: true,
        dangerous: false,
      });
    });

    it("带 WHERE 的 DELETE 为普通写", () => {
      expect(classifySqlOperation("DELETE FROM t WHERE id = 1")).toMatchObject({
        write: true,
        dangerous: false,
      });
    });

    it("未收录的关键字保守按写处理", () => {
      expect(classifySqlOperation("CALL some_proc()")).toMatchObject({
        write: true,
        dangerous: false,
      });
      expect(classifySqlOperation("ANALYZE TABLE t")).toMatchObject({ write: true });
    });
  });

  describe("不带 WHERE 升级为危险（对照用例：同一语句只差 WHERE）", () => {
    it("DELETE FROM t 升级为危险并说明影响全部行", () => {
      const cls = classifySqlOperation("DELETE FROM t");
      expect(cls).toMatchObject({ write: true, dangerous: true });
      expect(cls.reason).toContain("全部行");
    });

    it("DELETE FROM t WHERE … 不升级", () => {
      expect(classifySqlOperation("DELETE FROM t WHERE id = 1")).toMatchObject({
        dangerous: false,
      });
    });

    it("UPDATE t SET a = 1 升级为危险并说明影响全部行", () => {
      const cls = classifySqlOperation("UPDATE t SET a = 1");
      expect(cls).toMatchObject({ write: true, dangerous: true });
      expect(cls.reason).toContain("全部行");
    });

    it("UPDATE t SET a = 1 WHERE … 不升级", () => {
      expect(classifySqlOperation("UPDATE t SET a = 1 WHERE id = 1")).toMatchObject({
        dangerous: false,
      });
    });

    it("WHERE 只出现在子查询括号内不算带 WHERE（仍影响全表）", () => {
      const cls = classifySqlOperation("UPDATE t SET a = (SELECT x FROM y WHERE y.id = 1)");
      expect(cls).toMatchObject({ dangerous: true });
      expect(cls.reason).toContain("全部行");
    });

    it("字面量里的 WHERE 不能骗过升级判定", () => {
      expect(classifySqlOperation("DELETE FROM t /* WHERE id = 1 */")).toMatchObject({
        dangerous: true,
      });
    });
  });

  describe("DDL 与权限变更为危险", () => {
    it.each([
      ["DROP TABLE t", "DROP"],
      ["TRUNCATE TABLE t", "TRUNCATE"],
      ["ALTER TABLE t ADD COLUMN a INT", "ALTER"],
      ["RENAME TABLE a TO b", "RENAME"],
      ["CREATE TABLE t (a INT)", "CREATE"],
      ["GRANT ALL ON db.* TO u", "GRANT"],
      ["REVOKE ALL ON db.* FROM u", "REVOKE"],
    ])("%s 为危险", (sql, keyword) => {
      const cls = classifySqlOperation(sql);
      expect(cls).toMatchObject({ write: true, dangerous: true });
      expect(cls.reason).toContain(keyword);
    });

    it("原因文案保留表名的原始大小写（PG 标识符大小写敏感）", () => {
      expect(classifySqlOperation("DROP TABLE MyTable").reason).toContain("MyTable");
      expect(classifySqlOperation("drop table users").reason).toContain("table users");
    });
  });

  describe("注释与字面量不能影响判定", () => {
    it("/* SELECT */ DELETE FROM t 判为危险删除而非只读", () => {
      expect(classifySqlOperation("/* SELECT */ DELETE FROM t")).toMatchObject({
        write: true,
        dangerous: true,
      });
    });

    it("-- SELECT 换行后的 DROP 判为危险", () => {
      expect(classifySqlOperation("-- SELECT\nDROP TABLE t")).toMatchObject({
        write: true,
        dangerous: true,
      });
    });

    it("# SELECT 换行后的 DROP 判为危险（MySQL 行注释）", () => {
      expect(classifySqlOperation("# SELECT\nDROP TABLE t")).toMatchObject({
        dangerous: true,
      });
    });

    it("字面量中的分号不影响单条只读判定", () => {
      expect(classifySqlOperation("SELECT '; DROP TABLE t' AS s")).toMatchObject({
        write: false,
        dangerous: false,
      });
    });

    it("字面量中的关键字不影响判定", () => {
      expect(
        classifySqlOperation("SELECT * FROM t WHERE name = 'DELETE FROM x'")
      ).toMatchObject({ write: false, dangerous: false });
    });

    it("引号标识符中的关键字不影响判定", () => {
      expect(classifySqlOperation('SELECT "DROP" FROM t')).toMatchObject({ write: false });
      expect(classifySqlOperation("SELECT `DROP TABLE x` FROM t")).toMatchObject({
        write: false,
      });
    });
  });

  describe("带写意图的查询", () => {
    it("SELECT … FOR UPDATE 判为写并给出解释性文案", () => {
      const cls = classifySqlOperation("SELECT * FROM t WHERE id = 1 FOR UPDATE");
      expect(cls).toMatchObject({ write: true, dangerous: false });
      expect(cls.reason).toContain("行锁");
      expect(cls.reason).toContain("只读连接");
    });

    it("SELECT … LOCK IN SHARE MODE 判为写", () => {
      expect(classifySqlOperation("SELECT * FROM t LOCK IN SHARE MODE")).toMatchObject({
        write: true,
      });
    });

    it("SELECT … INTO 判为写", () => {
      expect(classifySqlOperation("SELECT * INTO backup FROM t")).toMatchObject({
        write: true,
        dangerous: false,
      });
    });

    it("字面量里的 for update 不触发行锁判定", () => {
      expect(classifySqlOperation("SELECT * FROM t WHERE s = 'for update'")).toMatchObject({
        write: false,
      });
    });
  });

  describe("EXPLAIN 与 CTE 的绕过面", () => {
    it("EXPLAIN ANALYZE DELETE 判为危险（PG 下会真的执行）", () => {
      const cls = classifySqlOperation("EXPLAIN ANALYZE DELETE FROM t");
      expect(cls).toMatchObject({ write: true, dangerous: true });
      expect(cls.reason).toContain("EXPLAIN");
    });

    it("数据修改型 CTE 判为危险（顶层关键字是 SELECT 却会删数据）", () => {
      const cls = classifySqlOperation(
        "WITH d AS (DELETE FROM t WHERE id = 1 RETURNING *) SELECT * FROM d"
      );
      expect(cls).toMatchObject({ write: true, dangerous: true });
      expect(cls.reason).toContain("CTE");
    });

    it("CTE 中含 DROP 判为危险", () => {
      expect(
        classifySqlOperation("WITH x AS (SELECT 1) SELECT * FROM x; ".trim())
      ).toMatchObject({ write: false });
      expect(classifySqlOperation("WITH x AS (SELECT 1) DROP TABLE t")).toMatchObject({
        dangerous: true,
      });
    });
  });
});
