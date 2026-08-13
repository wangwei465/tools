import { describe, it, expect } from "vitest";
import { buildKeyTree, isBranch, sortedChildren, type TreeNode } from "./keytree";
import type { KeyInfo } from "@/lib/redis/types";

/** 造 KeyInfo 的便捷函数（类型/TTL 对树结构无影响）。 */
function k(key: string): KeyInfo {
  return { key, type: "string", ttl: -1 };
}

/** 从根层数组取指定 segment 节点。 */
function pick(nodes: TreeNode[], segment: string): TreeNode {
  const n = nodes.find((x) => x.segment === segment);
  if (!n) throw new Error(`未找到节点 ${segment}`);
  return n;
}

describe("buildKeyTree 前缀树", () => {
  it("无分隔符的键作根层叶子，不产生空前缀分组", () => {
    const tree = buildKeyTree([k("foo"), k("bar")]);
    expect(tree).toHaveLength(2);
    const foo = pick(tree, "foo");
    expect(isBranch(foo)).toBe(false);
    expect(foo.fullKey).toBe("foo");
    // 不应出现 segment 为空的分组
    expect(tree.some((n) => n.segment === "")).toBe(false);
  });

  it("按分隔符归位到层级分支，叶子持完整 key", () => {
    const tree = buildKeyTree([k("user:1:name"), k("user:2:name")]);
    const user = pick(tree, "user");
    expect(isBranch(user)).toBe(true);
    expect(user.count).toBe(2); // 子树两个 key
    const one = pick(sortedChildren(user), "1");
    const name = pick(sortedChildren(one), "name");
    expect(name.fullKey).toBe("user:1:name");
    expect(isBranch(name)).toBe(false);
  });

  it("前缀恰为另一键时节点既是分支又是叶子", () => {
    const tree = buildKeyTree([k("user"), k("user:1")]);
    const user = pick(tree, "user");
    expect(isBranch(user)).toBe(true); // 有子节点 user:1
    expect(user.fullKey).toBe("user"); // 自身也是完整 key
    expect(user.count).toBe(2);
  });

  it("分支计数为子树下 key 总数", () => {
    const tree = buildKeyTree([k("a:b"), k("a:c"), k("a:d:e")]);
    expect(pick(tree, "a").count).toBe(3);
  });

  it("sortedChildren 分支在前、叶子在后", () => {
    const tree = buildKeyTree([k("root:leaf"), k("root:branch:x")]);
    const root = pick(tree, "root");
    const children = sortedChildren(root);
    expect(isBranch(children[0])).toBe(true); // branch 在前
    expect(children[0].segment).toBe("branch");
    expect(children[1].segment).toBe("leaf");
  });
});
