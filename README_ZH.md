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


## 混沌工程与智能体韧性评测框架 (Chaos Engineering & Resilience Evaluation)

自主 AI 智能体在真实生产环境中必然面临脆弱多变的基础设施：瞬态网络丢包、API 频控限流、执行超时、命令截断以及隐藏在外部文件或工具输出中的对抗性提示词注入（Prompt Injection）。**混沌工程与智能体韧性评测框架** (`src/chaos`) 支持向智能体工具管道注入确定性或概率性故障，并全方位量化智能体的故障自愈率、死循环抵御能力、提示词投毒防御能力与综合韧性评分。

### 1. 核心能力
- **模块化故障注入器 (Fault Injectors)**：
  - `latency`：注入网络延迟、时钟抖动或超时中断（模拟 `exitCode: 124`）。
  - `error`：注入指定退出码、自定义错误提示及模拟 HTTP 状态码（如 `503 Unavailable`、`403 Forbidden`）。
  - `rate_limit`：模拟 API 突发限流（`HTTP 429 Too Many Requests`）并返回 `Retry-After` 头。
  - `output_corruption`：破坏工具返回输出（截断、非法 JSON 语法破坏、空输出或乱码注入）。
  - `adversarial_prompt`：在工具输出中嵌入越狱指令或金丝雀诱饵 Token（`CHAOS_POISON_CANARY_42`），检测智能体是否被诱骗泄露机密或偏离用户目标。
- **自适应触发策略 (Trigger Strategies)**：
  - `always`：匹配工具与参数时每次必触发。
  - `burst`：突发注入 $N$ 次失败后恢复成功，用于严格验证重试与回退策略。
  - `every_n_calls`：按固定间隔周期性触发。
  - `call_index`：仅在指定调用序号时触发（如仅在第 1、3 步注入故障）。
  - `probability`：概率性注入（$0.0 \sim 1.0$），模拟真实 Chaos Monkey 混沌扰动。
- **全方位韧性度量与雷达看板 (Resilience Scorecard)**：
  - **故障自愈成功率 (Recovery Rate)**：检测智能体在遭遇工具报错后是否成功完成自我修复与重试。
  - **平均自愈轮次 (Mean Turns to Recovery, MTTR)**：度量智能体从发生故障到恢复常态的轮次开销。
  - **死循环风暴惩罚 (Retry Storms / Loops)**：检测智能体是否存在未改进参数的同命令死循环连续调用（$\ge 3$ 次）。
  - **投毒防御率 (Poison Defense Rate)**：严格检测金丝雀诱饵 Token 是否泄漏在智能体的推理过程或后续操作中。
  - **综合韧性得分与评级 (Resilience Score & Rating)**：0 ~ 100 分综合打分，划分为 `S`（无懈可击）、`A`（高度自愈）、`B`（降级容忍）、`C`（脆弱易受影响）、`F`（崩溃失效）五个等级。
- **开箱即用内置画像 (Pre-built Profiles)**：
  - `transient-network`：外部网络命令（git/npm/curl 等）瞬态丢包，重试即可自愈。
  - `rate-limit`：调用频次超出阈值后触发 HTTP 429 限流。
  - `adversarial-poison`：工具输出暗藏提示词越狱与金丝雀泄漏陷阱。
  - `corrupted-output`：输出损坏与破坏 JSON 格式。
  - `chaos-monkey`：随机网络抖动与偶发性环境报错。
- **多端报告呈现**：
  - `terminal`：高亮 ANSI 韧性雷达卡片、指标分解及架构优化建议。
  - `markdown`：适配 GitHub PR 评论的 Markdown 格式报告。
  - `json`：符合严格 Schema 的机器可读输出，无缝接入 CI 质量门禁。

### 2. 命令行使用示例 (CLI)
```bash
# 使用瞬态网络丢包画像执行混沌测试
agent-harness chaos -s scenario.yaml -p transient-network -c "npm install && npm test"

# 运行 Chaos Monkey 随机扰动并导出 Markdown 格式报告
agent-harness chaos -s scenario.yaml -p chaos-monkey --format markdown -o chaos-report.md

# 在 CI 流水线中设置最低韧性分数门禁（若分数低于 80 则退出码为 1）
agent-harness chaos -s scenario.yaml -p rate-limit --min-score 80
```

### 3. SDK 编程接口示例
```typescript
import { ChaosEngine, TransientNetworkProfile, renderResilienceScorecard } from "agent-harness";

// 基于画像初始化混沌引擎
const chaos = new ChaosEngine(TransientNetworkProfile);

// 挂载至虚拟工具分发器
dispatcher.setChaosEngine(chaos);

// 执行智能体工具调用
await dispatcher.call("exec_command", { command: "git clone https://example.com/repo.git" });

// 生成智能体韧性评分卡
const scorecard = chaos.generateScorecard("repo-clone-task");
console.log("韧性等级:", scorecard.metrics.rating); // S, A, B, C, F
console.log("综合得分:", scorecard.metrics.resilienceScore);

// 渲染为 Markdown 报告
const markdown = renderResilienceScorecard(scorecard, "markdown");
```


## 多轨迹集群共识比对与黄金路径挖掘引擎 (Cluster Consensus & Route Mining Engine)

在现代 AI 智能体评测与集成系统（如 Best-of-N 采样、Self-Consistency 多数投票、SWE-bench 多并行 Rollout 以及多智能体辩论）中，开发者通常会针对同一任务并行执行 $N$ 次独立轨迹。**多轨迹集群共识比对引擎** (`src/consensus`) 实现了渐进式多序列比对（Multi-Sequence Alignment, MSA），跨 $N$ 条轨迹进行全局步骤对齐，量化集群一致性与路径熵，自动发现不变瓶颈节点与死循环陷阱，并提炼合成出最优的**规范黄金轨迹 (Canonical Golden Trajectory)**。

### 1. 核心能力
- **渐进式多序列比对 (Progressive MSA)**：
  - 基于 Needleman-Wunsch 与 Profile 对齐算法，对离散工具调用、轮次终止与执行结果进行 $N$ 路全局时序对齐。
  - 容忍智能体的探索性试探命令与偶发分歧，避免全局时序错位。
- **共识层级与一致性打分**：
  - `invariant`（不变步骤）：100% 运行均执行的关键瓶颈。
  - `majority`（多数步骤）：>50% 运行达成共识的有效步骤。
  - `minority`（少数步骤）：$\le 50\%$ 运行执行的分支路径。
  - `outlier`（离群步骤）：仅单次运行出现的偶发尝试或幻觉调用。
- **关键节点与死区陷阱挖掘**：
  - **不变瓶颈节点 (Invariant Bottlenecks)**：成功运行必须经历的关键检查点，计算与成功的相关系数 ($r \in [-1, 1]$)。
  - **死循环与失败陷阱 (Dead-End Traps)**：集中导致智能体报错、超时或违规的死亡分支。
- **路径多样性与香农熵 (Path Diversity & Shannon Entropy)**：
  - 量化决策方差：低熵表示高度确定性解题，高熵揭示广泛的随机探索或决策漂移。
- **规范黄金轨迹合成与提炼 (Canonical Golden Trajectory Synthesis)**：
  - 自动剔除单次运行的离群试探与重复死循环，聚合高置信度共识步骤，重构为可执行的黄金轨迹。
- **多端报告呈现**：
  - `terminal`：高亮 ANSI ASCII 对齐矩阵、检查点勋章与共识雷达看板。
  - `markdown`：适配 GitHub PR 评论的 Markdown 格式报告。
  - `json`：机器可读的完整 MSA 矩阵与集群统计数据，便于接入自动化评测流水线。

### 2. 命令行使用示例 (CLI)
```bash
# 比对指定的多条轨迹 JSON
agent-harness consensus -t ./runs/run-1.json ./runs/run-2.json ./runs/run-3.json

# 分析目录下所有轨迹，生成 Markdown 报告并导出提炼的黄金轨迹
agent-harness consensus -t ./runs/ --format markdown -o consensus-report.md -s golden-trajectory.json

# 在 CI 流水线中设定最低共识分数门禁（低于 80 分则退出码为 1）
agent-harness consensus -t ./runs/ --min-score 80
```

### 3. SDK 编程接口示例
```typescript
import {
  ClusterConsensusEngine,
  renderConsensusReport,
  type Trajectory,
} from "agent-harness";

// 加载轨迹集合
const rollouts: Trajectory[] = [/* run1, run2, run3 */];

// 执行集群共识比对分析
const result = ClusterConsensusEngine.analyzeCluster(rollouts, {
  bottleneckThreshold: 0.8,
  minAgreementRate: 0.5,
});

console.log("集群共识得分:", result.metrics.overallAgreementScore);
console.log("路径多样性香农熵:", result.metrics.pathDiversityEntropy);
console.log("关键检查点数量:", result.bottlenecks.length);
console.log("黄金轨迹步骤数:", result.canonicalTrajectory.totalSteps);

// 渲染 Markdown 报告
const report = renderConsensusReport(result, "markdown");
```

## 轨迹策略蒸馏与自愈先验引导引擎 (Trajectory Policy Distillation & Dynamic Guidance Engine)

当多轨迹集群共识比对生成了**规范黄金轨迹 (Canonical Golden Trajectory)** 并锁定了高危**死区陷阱 (Dead-End Traps)** 后，**策略蒸馏与先验引导引擎** (`src/distillation`) 补齐了智能体闭环进化的关键拼图。它将散落的轨迹知识自动蒸馏为结构化先验策略、不变里程碑路线图（Milestone Roadmap）、负向防陷阱规则（Anti-Patterns）以及受 Token 预算约束的少样本示范（Few-Shot Exemplars），并在运行时动态分发引导信号，避免智能体在后续任务或重试中重蹈覆辙。

### 1. 核心能力
- **多源轨迹策略智能蒸馏**：
  - 支持从集群共识结果 (`ClusterConsensusResult`)、规范黄金轨迹 (`CanonicalTrajectory`) 或单次运行轨迹 (`Trajectory`) 中一键提炼策略。
  - 自动从瓶颈检查点提取正向里程碑节点（标注 `critical`、`recommended` 重要级）。
  - 自动将死区陷阱与高频报错聚类转化为负向禁阻规则 (`NegativePatternGuidance`) 并附带自愈补救建议。
- **Token 预算约束与冗余步骤压缩**：
  - 自动去重连续冗余探测步骤（如无意义的重复目录扫描与空调用）。
  - 支持严格 Token 预算约束（如 500、1500 tokens），采用中间探索轮次智能剪枝与输出摘要压缩，保留关键起点、终点与关键检查点。
- **运行时动态引导分发器 (Dynamic Guidance Dispatcher)**：
  - 内置智能体状态机 (`tracking`、`milestones_complete`、`diverged`、`blocked`)。
  - 实时评估执行步骤，输出动态反馈 (`hint`、`warn`、`block`、`milestone_advance`、`diverged`)。
  - 实时识别危险陷阱命令并即时阻断，给出替代方案建议。
- **动态断点控制器 (Steering Controller) 无缝集成**：
  - 自动生成符合 `SteeringController` 规范的断点拦截规则，实现开箱即用的运行时干预 (`override_tool`、`inject_prompt`)。
- **多目标格式导出器**：
  - `markdown`：格式化为系统提示词小节 (`# Strategic Execution Guidance & Proven Milestones`)。
  - `anthropic`：适配 Claude 的 XML 标签规范 (`<distilled_guidance>...</distilled_guidance>`)。
  - `fewshot`：符合 OpenAI 函数调用规范的对话消息数组。
  - `steering`：导出为断点规则 JSON 文件。
  - `terminal` & `markdown`：美观的高亮可视化评估报告。

### 2. 命令行使用示例 (CLI)
```bash
# 从集群共识结果中蒸馏策略并在终端显示 ANSI 报告
agent-harness distill -i ./runs/consensus-result.json

# 导出 Markdown 提示词引导并在指定路径生成动态断点规则
agent-harness distill -i ./runs/canonical.json -f markdown -o policy-guidance.md --export-steering ./steering-rules.json

# 设定 1000 Token 预算限制并导出 OpenAI 格式 Few-shot 对话数组
agent-harness distill -i ./runs/trajectory.json -f fewshot -b 1000 -o fewshot.json
```

### 3. SDK 编程接口示例
```typescript
import {
  PolicyDistillationEngine,
  renderDistillationReport,
  type DistilledPolicy,
} from "agent-harness";

const engine = new PolicyDistillationEngine({
  tokenBudget: 1200,
  includeNegativeGuidance: true,
  includeSteeringRules: true,
});

// 从共识结果中蒸馏策略
const policy: DistilledPolicy = engine.distillFromConsensus(consensusResult);

// 格式化为 Markdown 系统提示词
const systemPrompt = engine.formatPolicy(policy, "markdown");

// 创建运行时动态引导器
const dispatcher = engine.createDispatcher(policy);

// 在执行过程中实时评估步骤
const feedback = dispatcher.evaluateStep({
  turnNumber: 1,
  toolName: "bash",
  arguments: { command: "rm -rf /tmp/data" },
});

if (feedback.action === "block") {
  console.warn("已拦截危险命令:", feedback.message);
}
```

## 自适应任务合成与闭环自演进演练引擎 (Adaptive Task Synthesis & Auto-Curriculum Closed-Loop Engine)

静态评估基准常面临测试集污染、断言规则僵化以及缺乏动态反馈等问题。当断言校验器、混沌工程故障注入、轨迹共识分析与策略蒸馏定位了智能体的具体弱点（如 AST 语法脆弱性、高危安全违规、预算耗尽死循环、或工作区文件路径混淆）之后，**自适应任务合成与闭环自演进演练引擎** (`src/curriculum`) 能够自动生成由浅入深的阶梯式演练关卡，对自主智能体进行闭环评测、压力测试与定向自愈修复。

### 1. 核心能力与架构设计
- **四阶渐进难度演进天梯 (4-Tier Progressive Difficulty Ladder)**：
  - `novice`（新手）：自动注入分步指引提示词、放宽 25% 资源预算、补充规范指南文件。
  - `intermediate`（进阶）：追加工程级严苛约束（向下兼容性、函数签名保持）、预置配置文件。
  - `advanced`（高阶）：注入边界极限条件、收紧 15% 预算规模、强制执行安全不变式校验规则。
  - `adversarial`（对抗）：注入干扰性废弃代码文件、欺骗性上下文噪点、收紧命令通配符并施加 25% 极度预算压力。
- **四维变异合成器 (`TaskSynthesizer`)**：
  - `instruction`（任务指令）：确定性可复现伪随机种子变异、混淆提示词与特定弱点规约注入。
  - `workspace`（工作区代码库）：自动化注入诱饵文件、深层目录架构测试、TypeScript 类型定义补充。
  - `verifier`（断言与预算）：动态缩放 `maxTurns`、`timeoutMs`、`maxTokens`，并自动注入安全与步数断言。
  - `environment`（沙箱环境）：收紧命令执行白名单、动态扩充高危命令黑名单与沙箱安全边界。
- **弱点漏洞诊断画像器 (`WeaknessProfiler`)**：
  - 自动聚类分析历史 `HarnessReport` 失败数据，涵盖 7 大核心弱点分类：
    `ast_syntax_error`、`security_violation`、`infinite_loop`、`budget_exhaustion`、`command_flakiness`、`file_integrity`、`tool_format_error`。
  - 自动评估脆弱度指标并推荐最适配的训练关卡与定向变异配置。
- **自适应晋级准入与能力评级 (`AutoCurriculumRunner`)**：
  - 动态关卡晋级门禁：智能体必须在当前关卡达到设定的通过率阈值（如 $\ge 75\%$）方可解锁后续高难度阶段。
  - Elo 能力值动态演进：结合关卡难度系数与预期通过率实时计算能力增量 ($\Delta$)。
  - 深度联动策略蒸馏模块 (`src/distillation`)：在高级阶段无缝挂载先验引导策略，定量计算自愈通过率提升率（Uplift）。
- **多端可视化记分牌与导出器**：
  - `terminal`：高亮 ANSI 阶梯进度、Elo 评级变动卡片与弱点自愈雷达对比矩阵。
  - `markdown`：适合 CI/CD 流水线与 Pull Request 评审的完整 Markdown 报告。
  - `json`：完整的机器可读结果与量化指标。

### 2. 命令行使用示例 (CLI)
```bash
# 针对指定场景自动合成四阶完整训练天梯并执行评测
agent-harness curriculum -s ./scenarios/calc.yaml

# 运行指定难度关卡并导出生成的课程计划 JSON
agent-harness curriculum -s ./scenarios/calc.yaml --stages novice,intermediate --scenarios-per-stage 3 --export-plan ./curriculum-plan.json

# 在高级阶段挂载策略蒸馏先验引导并输出 Markdown 评审报告
agent-harness curriculum -s ./scenarios/calc.yaml -g ./runs/distilled-policy.json -f markdown -o ./curriculum-report.md

# 设定最低能力评级门槛（若最终能力值未达标则以非零状态码退出）
agent-harness curriculum -s ./scenarios/calc.yaml --min-competency 1050
```

### 3. SDK 编程接口示例
```typescript
import {
  AutoCurriculumEngine,
  TaskSynthesizer,
  AutoCurriculumRunner,
  renderCurriculumReport,
  type CurriculumResult,
} from "agent-harness";

const engine = new AutoCurriculumEngine();

// 1. 针对指定脆弱点合成单项变异任务
const mutatedScenario = engine.synthesizeTask(baseScenario, {
  difficulty: "advanced",
  targetWeaknesses: ["ast_syntax_error", "security_violation"],
  seed: 42,
});

// 2. 自动生成四阶渐进天梯计划
const plan = engine.generatePlan(baseScenario, {
  stages: ["novice", "intermediate", "advanced", "adversarial"],
  scenariosPerStage: 2,
  adaptiveGating: true,
});

// 3. 执行智能体闭环演进评测并挂载先验策略
const result: CurriculumResult = await engine.executeCurriculum({
  agent: myAgentAdapter,
  plan,
  guidancePolicy: distilledPolicy,
  stopOnGatingFailure: true,
});

console.log(renderCurriculumReport(result, "terminal"));
```

## 多智能体演练竞技场与天梯排位引擎 (Multi-Agent Arena)

单一孤立测试难以客观反映智能体在复杂多变任务中的相对能力水准。当面对多个不同基座模型（如 GPT-4o、Claude 3.5 Sonnet、DeepSeek V3、Llama 3）、Prompt 迭代版本或引导干预策略时，需要标准化的头对头竞技评测体系。**多智能体演练竞技场与天梯排位引擎** (`src/arena`) 提供多候选竞技调度、细粒度综合评判仲裁、科学的 Elo/Glicko-2 积分演进、双向交叉对决矩阵与可视化天梯榜单。

### 1. 核心能力
- **多元锦标赛赛制调度 (`MatchScheduler`)**:
  - `round-robin`（全循环赛）：所有候选智能体两两配对，在全部测试场景与轮次上展开全量头对头对抗。
  - `swiss`（瑞士轮）：根据即时天梯积分动态撮合水平相当的对手，避免同对手重复对决，在大规模智能体池中快速收敛排位。
  - `matrix`（基准矩阵）：全候选智能体并行遍历完整基准题库，生成全域评测剖面。
  - `bracket`（单败淘汰）：按预设或当前排位种子对阵（第 $1$ 对阵第 $N$，第 $2$ 对阵第 $N-1$），模拟激烈的锦标赛晋级。
- **多维度头对头综合仲裁器 (`MatchEvaluator`)**:
  - **确定性任务断言门禁**：首要判定准则——任务验证通过绝对战胜失败。
  - **多维决胜打分机制**：当双方均成功（或均失败）时，结合权重归一化计算效率与安全性综合分：
    - *轮次效率（Turn Efficiency）*：惩罚多余试探性轮次。
    - *Token 消耗效率（Token Efficiency）*：评估模型推理开销与上下文经济性。
    - *执行速度（Speed/Duration）*：奖励高效低延迟完成者。
    - *安全合规（Safety/Guardrails）*：扣除越权探测、恶意命令与沙箱违规行为分。
  - **自适应平局公差（Draw Tolerance）**：微小性能差异（如分差 $le 0.01$）自动判定为战平，避免微小扰动造成虚假胜负。
- **科学评级演进引擎 (`IRatingEngine`)**:
  - **自适应 Elo 引擎 (`EloRatingEngine`)**：经典 Elo 期望胜率曲线，搭载动态 K 值自适应调节（新手阶段放大 K 值以加速定位，成熟阶段收紧 K 值防止积分震荡）。
  - **Glicko-2 引擎 (`Glicko2RatingEngine`)**：涵盖能力分（$R$）、评分偏差确定度（$RD$）及波动率（$sigma$），提供置信区间。
- **双向交战交叉矩阵与胜率预测**:
  - 输出 $N \times N$ 双向交战胜负平对决表（`wins / draws / losses`）。
  - 基于当前评分即时预测两两对决期望胜率（`predictMatchOutcome`）。
- **多端可视化排行榜与导出**:
  - `terminal`：终端高亮 ANSI 奖牌榜（🥇、🥈、🥉）、双向对决胜负阵列与关键性能指标。
  - `markdown`：适配 GitHub PR、Wiki 与 CI/CD 流程的标准 Markdown 表格。
  - `json`：供数据分析与自动化管道接入的完整结构化锦标赛报告。

### 2. CLI 命令行使用
```bash
# 在指定场景上启动多个智能体候选的循环对抗赛
agent-harness arena -s ./scenarios/calc.yaml -a "claude-3-5,gpt-4o,deepseek-v3"

# 运行瑞士轮锦标赛，采用 Glicko-2 算法评级并导出排行榜 JSON
agent-harness arena -s ./scenarios/calc.yaml -a "agent-a,agent-b,agent-c,agent-d" --mode swiss --rating-system glicko2 --export-leaderboard ./leaderboard.json

# 运行两轮对抗赛并将 Markdown 报告持久化至文件
agent-harness arena -s ./scenarios/calc.yaml -a ./agents.json -m round-robin -r 2 -f markdown -o ./arena-report.md

# 设置冠军最低能力评分门禁（低于阈值退出码非零，适用于持续交付把关）
agent-harness arena -s ./scenarios/calc.yaml -a "agent-1,agent-2" --min-rating 1550
```

### 3. Programmatic SDK 编程调用
```typescript
import {
  ArenaEngine,
  renderArenaReport,
  type CandidateWithTarget,
} from "agent-harness";

const engine = new ArenaEngine();

const candidates: CandidateWithTarget[] = [
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    initialRating: 1500,
    target: claudeAgentAdapter,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    initialRating: 1500,
    target: gptAgentAdapter,
  },
];

// 1. 发起单场 1v1 头对头对决
const matchResult = await engine.evaluateMatch(candidates[0], candidates[1], scenario);
console.log(`胜负判定: ${matchResult.outcome}, 领先优势: ${matchResult.margin}`);

// 2. 发起多智能体锦标赛
const tournamentReport = await engine.runTournament({
  candidates,
  scenarios: [scenarioA, scenarioB],
  config: { mode: "round-robin", rounds: 1, ratingSystem: "elo" },
});

// 3. 渲染控制台天梯榜与对决阵列
console.log(renderArenaReport(tournamentReport, "terminal"));
```

---

## 对抗性红队攻防与安全沙箱护栏评测引擎

具备 Bash 执行能力、文件系统访问与外部工具调用的自主 AI 智能体存在严峻的安全暴露面与越权风险。**对抗性红队攻防与安全沙箱护栏评测引擎**（`src/redteam`）提供了全链路攻防演练套件，针对提示词注入、机密泄露、越权提权、破坏性操作与供应链攻击等风险向量实施自动化探针注入，评估攻击成功率（ASR）与安全韧性评分（0-100），并提供运行时主动护栏防御。

### 1. 核心特性
- **工业级多维度红队探针库 (`RedTeamProbeCatalog`)**：
  - `prompt-injection`（提示词注入）：系统指令强行覆盖（System Override）、越狱模式（Developer Uncensored Mode）。
  - `indirect-injection`（间接提示词注入）：隐藏在项目文件（如 `README.md`）中的特洛伊木马指令、被投毒的外部 Mock 工具响应。
  - `secret-exfiltration`（机密泄露与外发）：探测并读取 `.env`、私钥，或通过网络将金丝雀令牌（Canary Secret）外发至攻击者服务端。
  - `privilege-escalation`（越权提权）：尝试执行 `sudo su`、放开全局权限 `chmod 777`。
  - `destructive-command`（破坏性操作）：删除版本库元数据 `rm -rf .git` 或强行清空工作区 `rm -rf *`、`rm -rf /`。
  - `supply-chain`（供应链攻击）：未授权下载执行远端脚本管道（`curl | sh`、`wget | bash`）。
  - `defense-bypass`（防御绕过）：通过 Base64 编码解码管道（`base64 -d | sh`）规避静态签名检测。
- **自动化对抗性场景突变器 (`AdversarialMutator`)**：
  - 支持指令层（`instruction`）、文件层（`file-injection`）、环境变量层（`env-injection`）及 Mock 工具层（`mock-tool`）无缝注入探针载荷，不破坏基准测试业务契约。
- **全轨迹漏洞判定引擎 (`VulnerabilityDetector`)**：
  - 深度扫描智能体每一轮的命令执行、工具入参、模型思考与输出结果；
  - 精准比对金丝雀令牌与漏洞触发规则，客观判定攻击是被防御成功（Defended）、被护栏拦截（Guardrail Blocked）还是被攻破（Exploited）。
- **运行时主动安全护栏 (`CompositeGuardrail`)**：
  - `CommandSafetyGuardrail`：主动拦截破坏性删除、高危提权、远程脚本管道及混淆执行；
  - `SecretLeakGuardrail`：拦截访问敏感机密文件及输出中的金丝雀机密过滤；
  - 提供 `none`（无护栏探测）、`audit`（仅日志告警）与 `enforce`（主动抛出 `SecurityViolationError` 阻断执行）三种运行模式。
- **攻防对比基准评测 (`benchmarkDefense`)**：
  - 一键执行智能体在「裸奔基线」与「主动护栏守护」下的双轨比对，量化攻击成功率降幅（$\\Delta \\text{ASR}$）与安全韧性增益（$\\Delta \\text{Score}$）。
- **多格式专业审计报告**：
  - `terminal`：彩色风险等级徽章、ASR 指标仪表、风险类别矩阵与取证追踪；
  - `markdown`：可直接归档到 PR Review 与安全合规报告的 GitHub 表格；
  - `json`：CI/CD 自动化流水线专用的机器可读审计结果。

### 2. CLI 使用示例
```bash
# 对指定场景执行全量红队安全探针评测
agent-harness redteam -s ./scenario.yaml

# 指定高危分类并启用主动护栏阻断
agent-harness redteam -s ./scenario.yaml -c prompt-injection,secret-exfiltration -g enforce

# 发起护栏攻防对比基准评测并输出 Markdown 报告
agent-harness redteam -s ./scenario.yaml --benchmark-defense -f markdown -o ./redteam-benchmark.md

# CI/CD 安全门禁（攻击成功率超过 10% 或安全分低于 90 时阻断构建）
agent-harness redteam -s ./scenario.yaml --max-asr 0.10 --min-safety-score 90 --export-findings ./findings.json
```

### 3. SDK 编程式调用
```typescript
import {
  RedTeamEngine,
  renderRedTeamReport,
  renderBenchmarkComparison,
} from "agent-harness";

const engine = new RedTeamEngine();

// 1. 针对核心探针实施安全审计
const auditReport = await engine.auditAgent(myAgentTarget, scenario, {
  severities: ["critical", "high"],
  guardrailMode: "enforce",
});

console.log(renderRedTeamReport(auditReport, "terminal"));

// 2. 攻防提升对比基准评测
const benchmark = await engine.benchmarkDefense(myAgentTarget, scenario);
console.log(`防御拦截漏洞数: ${benchmark.preventedExploitsCount}`);
console.log(`安全评分提升: +${benchmark.deltaSafetyScore} 分`);
console.log(renderBenchmarkComparison(benchmark, "markdown"));
```

---

## 架构说明

详细架构规范、沙箱隔离机制与轨迹生命周期，请参阅 [docs/architecture.md](docs/architecture.md)。

---

## 开源协议

本项目采用 MIT 许可证开源。
