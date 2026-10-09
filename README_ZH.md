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
  - **AST 语法树语义断言**：基于 TypeScript 原生 AST 解析，深度验证函数/类/接口契约、参数及修饰符，检测 `eval`、`debugger`、`console`、`any`、`var` 等反模式，并守护圈复杂度与语法树层级深度。
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

---

## 实时 Web 遥测与 SSE 监控面板 (Live Dashboard)

`agent-harness` 内置零外部依赖的 HTTP 与 Server-Sent Events (SSE) 实时遥测服务端，并附带开箱即用的现代化 Web 监控面板：

### 1. 启动独立遥测监控服务端
```bash
agent-harness serve --port 3456
```
浏览器访问 `http://127.0.0.1:3456/dashboard` 即可查看可视化面板。

### 2. 评测执行时同步开启实时大屏
```bash
agent-harness run \
  --scenario ./scenario.yaml \
  --command "node agent.js" \
  --telemetry \
  --telemetry-port 3456 \
  --keep-alive
```

### 核心特性
- **现代化内嵌 Web 面板**：黑曜石暗色风格大屏，实时呈现执行轮次、Token 消耗、工具调用频次、执行耗时、AST 语义断言检查清单以及可折叠展开的原始事件 JSON 明细；
- **Server-Sent Events (SSE) 流式传输**：开放 `/api/events` 实时事件流，内置心跳保活（`: keepalive`），防止网络代理与反向代理连接超时；
- **断线重连回放机制**：支持标准 `Last-Event-ID` 请求头与 `?lastEventId=` 查询参数，依托高性能内存环形缓冲区（`EventRingBuffer`）自动回放网络抖动期间遗漏的事件；
- **多粒度主题过滤**：支持 `?types=tool:*,turn:*` 通配符过滤订阅；
- **标准化 REST 接口**：
  - `GET /api/status`：获取当前评测状态、在线客户端数、服务器运行时间与缓冲区指标；
  - `GET /api/history`：按条件分页/按类型检索事件历史流水；
  - `GET /api/report`：获取最新 HarnessReport 评测断言报告；
  - `GET /api/trajectory`：获取完整智能体执行轨迹；
  - `POST /api/events`：支持分布式集群、多进程或远程 Agent 上报遥测事件。

### TypeScript SDK 接入示例
```typescript
import { TelemetryServer, TelemetryObserver, AgentHarness } from 'agent-harness';

// 启动遥测服务端
const server = new TelemetryServer({ port: 3456, host: '127.0.0.1' });
const { url } = await server.start();
console.log(`实时监控大屏已就绪: ${url}/dashboard`);

// 挂载遥测观察者至执行流水线
const observer = new TelemetryObserver({ server });

const { report } = await AgentHarness.runScenario(
  scenario,
  async (ctx) => {
    // 执行过程中的所有 turn、tool 调用与沙箱状态将实时推送至 Web 仪表盘
  },
  { observers: [observer] }
);

server.setLatestReport(report);
```

## 交互式转向与断点调试器 (Human-in-the-Loop)

在自主智能体执行复杂工程任务与长链路评测时，往往会出现幻觉、陷入死循环或执行危险操作。**Interactive Steering & Breakpoint Engine** 为评估流水线赋予了类似调试器（Debugger）的实时干预与动态调试能力。

### 1. 条件断点规则 (Breakpoint Rules)
支持在启动时配置或运行时动态注册以下断点规则：
- **`tool`**：按工具名完全匹配或正则匹配（如 `^exec_.*`、`bash`），支持入参字段过滤匹配。
- **`error_count`**：连续工具报错达到指定阈值时自动触发挂起（如连续报错 3 次）。
- **`turn`**：智能体执行轮次达到设定上限时触发断点。
- **`budget_ratio`**：Token 或轮次预算消耗达到安全警戒线（如 `>= 0.85`）时触发挂起。
- **`custom`**：传入自定义异步谓词函数，按任意运行时上下文动态判断。

### 2. 运行时干预动作 (Intervention Actions)
智能体命中断点或被手动挂起后，支持下达以下干预指令：
- `continue`：单步放行或继续执行；
- `inject_prompt`：向 Agent 注入外部反馈/纠偏指令，在 Agent 上下文中消费（`ctx.steering.consumeInjectedPrompts()`）；
- `override_tool`：拦截目标工具调用，替换其返回结果（Mock override），跳过沙箱原生进程执行；
- `skip_tool`：直接跳过目标工具执行并返回成功；
- `abort`：安全终止执行，将轨迹状态标记为 `aborted` 并生成断言报告。

### 3. RESTful 控制接口清单

| 请求方式 | 路由端点 | 功能说明 |
| :--- | :--- | :--- |
| `GET` | `/api/control/state` | 获取当前挂起状态、命中断点详情、断点规则列表与干预历史 |
| `POST` | `/api/control/pause` | 手动挂起正在执行的智能体场景 |
| `POST` | `/api/control/resume` | 恢复智能体执行 |
| `POST` | `/api/control/intervene` | 提交干预操作（`inject_prompt`, `override_tool`, `skip_tool`, `abort`） |
| `POST` | `/api/control/breakpoint` | 动态添加新断点规则 |
| `DELETE` | `/api/control/breakpoint?id=<id>` | 移除指定断点规则 |

### 4. CLI 命令行与 SDK 使用

在 CLI 评测中启用交互式断点与实时 Web 监控：
```bash
agent-harness run -s ./scenario.yaml --telemetry -i --breakpoint tool:bash --breakpoint error:3
```

TypeScript SDK 编程式调用：
```typescript
import { AgentHarness, SteeringController, TelemetryServer } from 'agent-harness';

const steering = new SteeringController();

// 注册高危命令断点
steering.addBreakpoint({
  id: 'bp_bash_guard',
  type: 'tool',
  toolPattern: 'bash',
});

// 挂载至遥测服务端
const server = new TelemetryServer({ port: 3456, steering });
await server.start();

const { report, trajectory } = await AgentHarness.runScenario(
  scenario,
  async (ctx) => {
    // 轮次中消费外部人类专家注入的提示词
    const prompts = ctx.steering?.consumeInjectedPrompts();
    if (prompts && prompts.length > 0) {
      console.log('收到人类指导提示词:', prompts);
    }

    await ctx.tools.call('bash', { command: 'echo hello' });
  },
  { steering }
);
```

## 差分轨迹对比与回归分析引擎 (Differential Trajectory Comparator)

在自主智能体研发与评测过程中，无论进行提示词优化、底层大模型选型（如 Claude 3.5 Sonnet 与 GPT-4o 评测比对），还是对比无干预与人类在环（HITL）调优效果，单一的最终断言成功/失败均无法解释执行过程中的隐蔽退化。**差分轨迹对比与回归分析引擎** 为智能体轨迹提供了基于序列对齐算法的逐步比对、回归严重度评分、多维异动检测与根因定位能力。

### 1. 核心能力
- **动态序列对齐 (Dynamic Sequence Alignment)**：基于 Needleman-Wunsch 动态规划全局序列对齐算法，自适应对齐工具调用序列与思考过程，精确识别并标记重排或探索性动作。
- **根因分歧点精准定位 (Root-Cause Divergence)**：自动检测并高亮智能体行为发生偏离的**首个分歧步骤 (First Divergence Step)**，细分为工具名称不匹配、参数偏移、工具报错、或过早终止。
- **全方位指标差分矩阵**：细粒度统计轮次差（Turns Delta）、工具调用量差（Tool Calls Delta）、Prompt/Completion/Total Token 消耗差、耗时及推理成本差。
- **智能轨迹异常检测 (Anomaly Detection)**：
  - `loop_detected`：循环死循环调用检测（同一工具及完全相同入参连续调用 $\ge 3$ 次）。
  - `error_spike`：工具执行报错激增检测。
  - `token_explosion`：Token 异常暴涨检测（超出预设水位如 $+50\%$）。
  - `empty_turn`：无工具调用且无有效回复的空轮次检测。
  - `rapid_failure`：过早崩溃或异常退出检测。
- **多格式可视化差分报告**：
  - `terminal`：高亮 ANSI 彩色终端对比，带有严重度徽章与步骤对齐标签（`[MATCH]`、`[MODIFIED]`、`[ADDED]`、`[REMOVED]`）。
  - `markdown`：适配 GitHub PR 评论的 Markdown 格式报告，包含指标卡片、工具分布表与对齐轨迹详情。
  - `html`：黑曜石暗黑极简风格的独立 HTML 大屏报告，内置指标卡、分歧警告与响应式数据表格。
  - `json`：符合严格 Zod Schema 的机器可读结构化数据，供自动化 CI 流水线二次消费。
- **CI/CD 回归门禁管控**：命令行提供 `--fail-on-regression` 标志，当检测到功能或稳定性退化时返回非零退出码（`1`）。

### 2. 命令行使用示例 (CLI)
```bash
# 终端内比对两个轨迹文件
agent-harness diff baseline.json candidate.json

# 生成 Markdown 格式报告供 GitHub PR 汇总使用
agent-harness diff baseline.json candidate.json --format markdown --output diff-report.md

# 生成独立 HTML 可视化差分报告
agent-harness diff baseline.json candidate.json --format html --output diff-report.html

# 在 CI 流水线中进行防回归门禁拦截（若退化则退出码为 1）
agent-harness diff baseline.json candidate.json --fail-on-regression --token-ratio 0.4
```

### 3. SDK 编程接口示例
```typescript
import { TrajectoryComparator, renderTrajectoryDiff } from "agent-harness";

// 对比两条轨迹文件对象
const diff = TrajectoryComparator.compare(baselineTrajectory, candidateTrajectory, {
  strictArgs: false,
  tokenRegressionRatio: 0.5,
  minSimilarityThreshold: 0.6,
});

console.log("是否存在回归:", diff.regression.isRegression);
console.log("严重程度评分:", diff.regression.severity); // "identical" | "equivalent" | "minor_drift" | "regression" | "critical_failure"
console.log("首个分歧点:", diff.firstDivergence?.description);

// 渲染为 Markdown 文本
const markdown = renderTrajectoryDiff(diff, "markdown");
```

## 架构说明

详细架构规范、沙箱隔离机制与轨迹生命周期，请参阅 [docs/architecture.md](docs/architecture.md)。

---

## 开源协议

本项目采用 MIT 许可证开源。
