import { SqlResult, ok, err, errMessage } from "./result";
import { parseCsvTable, CsvOptions, CsvTable, DELIMITERS } from "@/lib/shared/csv";

/**
 * CSV 解析——SQL 工具侧的薄包装。
 *
 * 解析算法已提取到 lib/shared/csv.ts（仓库中唯一一份），本模块只负责把
 * 抛出的错误转成 SqlResult。对外签名与行为保持不变，调用方无需改动。
 */

export { DELIMITERS };
export type { CsvOptions, CsvTable };

/** 解析 CSV 为表头 + 数据行；列数与表头不一致时报错并指出行号。 */
export function parseCsv(text: string, options: CsvOptions): SqlResult<CsvTable> {
  try {
    return ok<CsvTable>(parseCsvTable(text, options));
  } catch (e) {
    return err<CsvTable>(errMessage(e));
  }
}
