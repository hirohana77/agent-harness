# agent-harness (中文说明)

> 面向自主 AI 编程智能体的确定性执行沙箱、轨迹评估与断言测试 Harness

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-green.svg)](https://vitest.dev/)

[English](README.md) | [中文说明](README_ZH.md)

---

## 核心特性

- 🛡️ **隔离沙箱与路径约束**：动态创建隔离临时工作区，初始化 Git 独立环境，强制约束文件路径不得越权逃逸。
- 🔒 **安全守卫策略**：拦截危险命令（如 `rm -rf /`、未授权网络请求等），防止智能体误操作破坏宿主系统。
- ⏱️ **确定性轨迹记录**：全流程精细化记录 Agent 的轮次（Turn）、思考过程（Thought）、工具调用（Tool Calls）、Token 消耗与耗时。
- ⚡ **实时流式 Trajectory 事件总线**：基于发布/订阅模型的高性能事件总线，支持通配符订阅（`tool:*`, `*`）、异步调度与零崩溃异常边界隔离。
- 📡 **流式观测器插件**：
  - `LiveConsoleObserver`：终端实时彩色进度流，展示 Turn 阶段、工具调用及耗时。
  - `JsonLinesStreamObserver`：实时 NDJSON 行格式文件流写入，断电或异常崩溃数据零丢失。
  - `BufferedStreamObserver`：内存滑动窗口缓冲，支持断点回放与按类型过滤。
- 🔁 **离线轨迹回放（Deterministic Replay）**：无需再次消耗 LLM API，直接重放已记录的操作轨迹，高效进行回归比对与环境复现。
- 🛠️ **虚拟工具派发与 Mock 引擎**：原生工作区工具与自定义 Mock 模拟器无缝整合，支持调用次数与参数断言。
- 🧪 **多维断言验证引擎**：
  - **文件断言**：存在性、文本包含/排除、正则匹配、精确内容比对、JSON Schema 校验。
  - **命令断言**：运行项目原生测试命令（如 `npm test`、`pytest` 等）并断言退出码与控制台输出。
  - **行为轨迹断言**：限制最大轮次、指定工具调用、Token 上限守卫。
- 📊 **多格式评测报告**：支持控制台高亮终端报表、GitHub PR 专用的 Markdown 表格、以及自动化流水线集成的 JSON 报表。

---

## 快速安装

```bash
# 全局安装 CLI
npm install -g agent-harness
# 或使用 pnpm
pnpm add -g agent-harness

# 作为项目依赖
pnpm add agent-harness
```

---

## 快速开始 (CLI)

### 1. 初始化场景模版
```bash
agent-harness init --output ./my-scenario.yaml
```

### 2. 校验场景配置合法性
```bash
agent-harness validate --scenario ./my-scenario.yaml
```

### 3. 运行评测场景（带实时流式输出）
```bash
agent-harness run \
  --scenario ./my-scenario.yaml \
  --command "npm test" \
  --live \
  --stream-jsonl ./events.jsonl \
  --report-json ./eval-report.json \
  --report-md ./eval-report.md
```

### 4. 离线确定性重放
```bash
agent-harness replay \
  --scenario ./my-scenario.yaml \
  --trajectory ./trajectory.json
```

---

## 实时流式事件总线 (SDK API)

```typescript
import {
  AgentHarness,
  TrajectoryEventBus,
  LiveConsoleObserver,
  JsonLinesStreamObserver,
  BufferedStreamObserver,
} from 'agent-harness';

const eventBus = new TrajectoryEventBus();

// 监听特定事件类型或通配符
eventBus.on('tool:*', (event) => {
  console.log(`[工具事件] ${event.type}: ${event.toolName}`);
});

eventBus.on('budget:warning', (warning) => {
  console.warn(`[预算预警] ${warning.message}`);
});

// 配置流式观测器
const consoleObserver = new LiveConsoleObserver({ verbose: true });
const jsonlObserver = new JsonLinesStreamObserver('./run-events.jsonl');
const bufferObserver = new BufferedStreamObserver({ maxSize: 1000 });

const { report, trajectory } = await AgentHarness.runScenario(
  scenarioDefinition,
  async (ctx) => {
    ctx.recorder.startTurn('分析并修复计算器除零异常');

    const result = await ctx.tools.call('exec_command', { command: 'node test.js' });

    ctx.recorder.completeTurn('修复完成并验证通过', {
      promptTokens: 150,
      completionTokens: 80,
      totalTokens: 230,
    });
  },
  {
    eventBus,
    observers: [consoleObserver, jsonlObserver, bufferObserver],
  }
);
```

---

## 架构说明

详细架构规范、沙箱隔离机制与轨迹生命周期，请参阅 [docs/architecture.md](docs/architecture.md)。

---

## 开源协议

本项目采用 MIT 许可证开源。
