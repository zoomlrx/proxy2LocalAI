import { describe, expect, test } from "vitest";
import bridgeBuildConfig from "../tsup.config";

describe("Bridge 构建配置", () => {
  test("release 包需要内联 shared 依赖，避免 start 脚本运行时缺包", () => {
    const config = (Array.isArray(bridgeBuildConfig) ? bridgeBuildConfig[0] : bridgeBuildConfig) as {
      noExternal?: Array<string | RegExp>;
    };

    expect(config.noExternal).toContain("@proxy2localai/shared");
  });
});
