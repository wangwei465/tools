/**
 * 按数据源类型取关系型驱动。
 *
 * 单独成文件而非并入 `rdb.ts`：`rdb.ts` 承载接口与纯函数（LIMIT 注入判定、
 * 值序列化、目录行映射），要能在不 import 任何数据库驱动的情况下被单测覆盖。
 * 一旦把驱动实例挂进去，那层纯粹性就没了。
 */
import { describeMysqlError, mysqlDriver, pingMysqlOnce } from "./rdb-mysql";
import { describePgError, pgDriver, pingPgOnce } from "./rdb-pg";
import type { RdbDriver } from "./rdb";
import type { DatastoreConnection, DatastoreType } from "./types";
import { isRdbType } from "./types";

/** 取驱动；非关系型类型直接报错（调用方应先用 isRdbType 分流）。 */
export function getRdbDriver(type: DatastoreType): RdbDriver {
  switch (type) {
    case "mysql":
      return mysqlDriver;
    case "postgres":
      return pgDriver;
    default:
      throw new Error(`不支持的关系型数据源类型：${type}`);
  }
}

/** 连接测试：临时建连取版本，不入池。 */
export function pingRdbOnce(conn: DatastoreConnection): Promise<string> {
  switch (conn.type) {
    case "mysql":
      return pingMysqlOnce(conn);
    case "postgres":
      return pingPgOnce(conn);
    default:
      throw new Error(`不支持的关系型数据源类型：${conn.type}`);
  }
}

/** 驱动原始异常翻译为可读原因。 */
export function describeRdbError(type: DatastoreType, err: unknown): string {
  switch (type) {
    case "mysql":
      return describeMysqlError(err);
    case "postgres":
      return describePgError(err);
    default:
      return err instanceof Error ? err.message : "执行失败";
  }
}

export { isRdbType };
