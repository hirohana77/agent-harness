# agent-harness (中文说明)

> 面向自主 AI 编程智能体的确定性执行沙箱、轨迹评估与断言测试 Harness

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-green.svg)](https://vitest.dev/)

[English](README.md) | [中文说明](README_ZH.md)

---

## 核心特性

- 🐳 **可插拔沙箱后端 (Docker & Podman)**：支持轻量级本地环境与全虚拟化 Docker / Podman 容器驱动，提供 cgroups 资源限制（内存、CPU、进程数）与完全网络隔离（`network: none`）。
- 🏆 **SWE-bench 任务集适配器与评测引擎**：原生支持导入 SWE-bench / Lite / Verified JSONL 格式任务集，自动装配专属容器镜像、提取 `FAIL_TO_PASS` 与 `PASS_TO_PASS` 测试断言，并支持一键统计 Resolve 成功率与导出官方格式 Predictions。
- 🛡️ **隔离工作区与路径约束**：动态创建隔离临时工作区，初始化 Git 独立环境，强制约束文件路径不得越权逃逸。
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

## SWE-bench 任务集导入与评测工作流

`agent-harness` 提供了开箱即用的 SWE-bench 数据集导入与自动化评测支持。

### 查看数据集摘要统计
```bash
agent-harness swebench info -i ./swe-bench-lite.jsonl
```

### 批量转换为 Harness 场景配置
```bash
agent-harness swebench import \
  -i ./swe-bench-lite.jsonl \
  -o ./scenarios/swebench/ \
  --format yaml \
  --sandbox docker \
  --image-prefix "swebench/sweb.eval.x86_64."
```

### 评估 Agent Predictions 补丁产物
```bash
agent-harness swebench eval \
  -d ./swe-bench-lite.jsonl \
  -p ./predictions.json \
  -o ./swebench-summary.json
```

### 通过 SDK 运行 SWE-bench 评测

```typescript
import { BenchmarkRunner, SWEBenchAdapter, SWEBenchEvaluator } from 'agent-harness';

const { summary, swebench } = await BenchmarkRunner.runSWEBench(
  {
    datasetPath: './swe-bench-lite.jsonl',
    concurrency: 4,
    adapterOptions: {
      sandboxBackend: 'docker',
      memoryLimit: '4g',
      cpuLimit: 2.0,
    },
  },
  async (ctx) => {
    // 智能体自主定位代码并打补丁
    ctx.recorder.startTurn('分析并修复 issue');
    await ctx.executor.execute('git apply eval_test.patch');
    ctx.recorder.completeTurn('修复完成');
  }
);

console.log(`解决率 (Resolved Rate): ${swebench.resolveRatePercent}%`);
console.log(`解决实例: ${swebench.resolvedInstances} / ${swebench.totalInstances}`);
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

## Docker & Podman 容器沙箱隔离

针对不可信智能体代码执行或多环境依赖评测（如 SWE-bench 场景），`agent-harness` 提供全虚拟化容器驱动：

### 场景配置模版 (`scenario.yaml`)
```yaml
id: docker-eval-demo
name: Docker 容器沙箱代码评测
sandbox:
  backend: docker             # 支持 "local" | "docker" | "podman"
  container:
    image: node:20-alpine
    network: none             # 严格网络隔离
    memoryLimit: 512m
    cpuLimit: 1.0
    pidsLimit: 100
    workdir: /workspace
task:
  instruction: 修复代码缺陷并通过回归单元测试
```

### CLI 容器控制参数
```bash
agent-harness run \
  --scenario ./scenario.yaml \
  --sandbox docker \
  --image python:3.11-slim \
  --container-network none \
  --command "pytest -v"
```

### 容器生命周期安全守护
- 宿主机临时工作区通过数据卷自动挂载进容器内部，文件修改双向同步，评测断言原生容器内执行；
- 内置 `ContainerProcessRegistry` 监听进程退出与中断信号（`SIGINT` / `SIGTERM`），确保评测无论成功、失败或异常中断均 100% 自动清理无僵尸容器；
- 支持智能探测 Docker / Podman 守护进程状态与动态回退。

## 架构说明

详细架构规范、沙箱隔离机制与轨迹生命周期，请参阅 [docs/architecture.md](docs/architecture.md)。

---

## 开源协议

本项目采用 MIT 许可证开源。
