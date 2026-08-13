// js-yaml v5 为 ESM 具名导出、无 default 导出，须用命名空间导入
import * as yaml from "js-yaml";
import { ConvertResult, ok, err, errMessage } from "./result";

/**
 * JSON ⇔ YAML 互转 + JSON 美化/压缩/校验。
 *
 * YAML 依赖 js-yaml v5：load 默认使用安全 schema（不构造任意类型），dump 输出块风格。
 * 所有函数对非法输入返回 { ok:false, error }，不抛异常。
 */

/** JSON 文本 → YAML 文本。 */
export function jsonToYaml(input: string): ConvertResult {
  if (!input.trim()) return err("请输入 JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    return err(`JSON 解析失败：${errMessage(e)}`);
  }
  try {
    // indent 2 与工具内其他 JSON 缩进保持一致；lineWidth -1 关闭自动折行避免长字符串被拆
    return ok(yaml.dump(parsed, { indent: 2, lineWidth: -1 }));
  } catch (e) {
    return err(`YAML 生成失败：${errMessage(e)}`);
  }
}

/** YAML 文本 → JSON 文本（美化，缩进 2）。 */
export function yamlToJson(input: string): ConvertResult {
  if (!input.trim()) return err("请输入 YAML");
  let parsed: unknown;
  try {
    parsed = yaml.load(input);
  } catch (e) {
    return err(`YAML 解析失败：${errMessage(e)}`);
  }
  try {
    return ok(JSON.stringify(parsed, null, 2));
  } catch (e) {
    // 循环引用等极端情况
    return err(`JSON 生成失败：${errMessage(e)}`);
  }
}

/** JSON 美化（缩进 2）。 */
export function formatJson(input: string): ConvertResult {
  if (!input.trim()) return err("请输入 JSON");
  try {
    return ok(JSON.stringify(JSON.parse(input), null, 2));
  } catch (e) {
    return err(`JSON 解析失败：${errMessage(e)}`);
  }
}

/** JSON 压缩（单行）。 */
export function minifyJson(input: string): ConvertResult {
  if (!input.trim()) return err("请输入 JSON");
  try {
    return ok(JSON.stringify(JSON.parse(input)));
  } catch (e) {
    return err(`JSON 解析失败：${errMessage(e)}`);
  }
}
