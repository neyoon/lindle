"""
代码生成器

将工作流定义转换为**自包含**的结构化 Python 项目。
生成的项目不依赖 Lindle，可以独立运行。

生成的项目结构:
    my_workflow/
    ├── main.py                 # 入口：加载配置 → 按步骤执行流水线
    ├── config.yaml             # 配置：模型、API Key
    ├── pipeline/
    │   ├── __init__.py
    │   ├── engine.py           # 执行引擎（串行步骤，并行块）
    │   ├── llm.py              # LLM 调用（OpenAI 兼容）
    │   └── context.py          # 上下文：步骤间数据传递
    ├── steps/
    │   ├── __init__.py
    │   ├── step_01.py          # 每个 AI/Tool 块一个文件
    │   └── step_02.py
    ├── prompts/
    │   ├── step_01.md          # AI 块的 prompt 独立文件
    │   └── step_02.md
    └── requirements.txt

设计目标:
- 生成的代码可以直接 python main.py 运行
- LLM 可以直接阅读文件层次理解整个流程
- 每个文件短小精悍，职责单一
- 不依赖 Lindle 包，完全自包含
"""

from __future__ import annotations

import os
import re
from typing import Any

from flow.models import Block, BlockType, Column, Workflow


class CodeGenerator:
    """将工作流转换为自包含的 Python 项目"""

    def generate(self, workflow: Workflow, output_dir: str) -> str:
        """生成完整的 Python 项目

        Args:
            workflow: 工作流定义
            output_dir: 输出目录

        Returns:
            生成的项目根目录路径
        """
        project_dir = os.path.join(output_dir, _safe_name(workflow.name))

        os.makedirs(os.path.join(project_dir, "pipeline"), exist_ok=True)
        os.makedirs(os.path.join(project_dir, "steps"), exist_ok=True)
        os.makedirs(os.path.join(project_dir, "prompts"), exist_ok=True)

        self._generate_main(workflow, project_dir)
        self._generate_config(workflow, project_dir)
        self._generate_pipeline_package(project_dir)
        self._generate_steps(workflow, project_dir)
        self._generate_prompts(workflow, project_dir)
        self._generate_requirements(project_dir)
        self._generate_steps_init(workflow, project_dir)

        return project_dir

    def _generate_main(self, workflow: Workflow, project_dir: str) -> None:
        """生成 main.py - 入口文件，定义并执行流水线"""
        columns = workflow.get_sorted_columns()

        step_defs: list[str] = []
        imports: list[str] = []
        step_index = 0

        for col in columns:
            for block in col.blocks:
                if block.type == BlockType.COLLECT:
                    fields = block.config.fields or []
                    field_list = ", ".join(f'"{f.name}"' for f in fields)
                    step_defs.append(
                        f'    {{"type": "collect", "name": "{block.name}", "fields": [{field_list}]}}'
                    )

                elif block.type == BlockType.PROCESS:
                    step_index += 1
                    func_name = f"step_{step_index:02d}"
                    imports.append(f"from steps.{func_name} import run as {func_name}")

                    schema_arg = ""
                    if block.output_schema and block.output_schema.keys:
                        keys_str = ", ".join(f'"{k}"' for k in block.output_schema.keys)
                        schema_arg = f', "output_keys": [{keys_str}]'

                    step_defs.append(
                        f'    {{"type": "process", "name": "{block.name}", "run": {func_name}{schema_arg}}}'
                    )

                elif block.type == BlockType.RESULT:
                    step_defs.append(
                        f'    {{"type": "result", "name": "{block.name}"}}'
                    )

        imports_str = "\n".join(imports)
        steps_str = ",\n".join(step_defs)

        code = f'''#!/usr/bin/env python3
"""
{workflow.name}
{workflow.description or ""}

自动生成 by Lindle
使用方式: python main.py
"""

import asyncio
import yaml
from pathlib import Path

from pipeline.engine import Engine
from pipeline.llm import configure as configure_llm

{imports_str}

STEPS = [
{steps_str}
]


def load_config() -> dict:
    """加载配置文件"""
    config_path = Path(__file__).parent / "config.yaml"
    if config_path.exists():
        with open(config_path, encoding="utf-8") as f:
            return yaml.safe_load(f) or {{}}
    return {{}}


async def main():
    """主函数"""
    config = load_config()
    llm_config = config.get("llm", {{}})
    configure_llm(
        api_key=llm_config.get("api_key", ""),
        base_url=llm_config.get("base_url", "https://api.openai.com/v1"),
        default_model=llm_config.get("default_model", "gpt-4o-mini"),
    )

    user_inputs = {{}}
    for step in STEPS:
        if step["type"] == "collect":
            print(f"\\n[输入] {{step['name']}}")
            for field_name in step.get("fields", []):
                value = input(f"  请输入 {{field_name}}: ")
                user_inputs[field_name] = value

    print("\\n开始执行...\\n")
    engine = Engine(STEPS)
    result = await engine.run(user_inputs)

    print("\\n" + "=" * 50)
    if result["success"]:
        print("执行完成")
        for key, value in result["output"].items():
            print(f"\\n[输出] [{{key}}]:")
            print(value if isinstance(value, str) else str(value))
    else:
        print(f"执行失败: {{result.get('error', '未知错误')}}")

    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
'''
        _write(os.path.join(project_dir, "main.py"), code)

    def _generate_config(self, workflow: Workflow, project_dir: str) -> None:
        """生成 config.yaml"""
        models: set[str] = set()
        for col in workflow.columns:
            for block in col.blocks:
                if block.type == BlockType.PROCESS and block.config.model:
                    models.add(block.config.model)

        default_model = next(iter(models)) if models else "gpt-4o-mini"

        config = f"""llm:
  api_key: "${{OPENAI_API_KEY}}"
  base_url: "https://api.openai.com/v1"
  default_model: "{default_model}"
"""
        _write(os.path.join(project_dir, "config.yaml"), config)

    def _generate_pipeline_package(self, project_dir: str) -> None:
        """生成 pipeline/ 包 - 自包含的执行引擎"""

        _write(os.path.join(project_dir, "pipeline", "__init__.py"), "")
        _write(os.path.join(project_dir, "pipeline", "llm.py"), _PIPELINE_LLM_CODE)
        _write(os.path.join(project_dir, "pipeline", "context.py"), _PIPELINE_CONTEXT_CODE)
        _write(os.path.join(project_dir, "pipeline", "engine.py"), _PIPELINE_ENGINE_CODE)

    def _generate_steps(self, workflow: Workflow, project_dir: str) -> None:
        """为每个 AI 块生成独立的 step 文件"""
        step_index = 0
        for col in workflow.get_sorted_columns():
            for block in col.blocks:
                if block.type != BlockType.PROCESS:
                    continue

                step_index += 1
                module_name = f"step_{step_index:02d}"
                file_name = f"{module_name}.py"
                prompt_file = f"{module_name}.md"
                model_val = f'"{block.config.model}"' if block.config.model else "None"

                output_schema_code = "None"
                if block.output_schema and block.output_schema.keys:
                    keys_str = ", ".join(f'"{k}"' for k in block.output_schema.keys)
                    output_schema_code = f"[{keys_str}]"

                code = f'''"""
步骤 {step_index}: {block.name}

职责: 接收上游数据，调用 LLM 处理后返回结果。
提示词: prompts/{prompt_file}
"""

from pathlib import Path
from pipeline.llm import call_llm

NAME = "{block.name}"

PROMPT_FILE = Path(__file__).parent.parent / "prompts" / "{prompt_file}"

MODEL = {model_val}

OUTPUT_KEYS = {output_schema_code}


def get_prompt() -> str:
    """加载提示词"""
    return PROMPT_FILE.read_text(encoding="utf-8")


async def run(upstream_data: str) -> str | dict:
    """执行此步骤

    Args:
        upstream_data: 上游步骤传递的数据（已自动格式化为文本）

    Returns:
        LLM 处理结果。若定义了 OUTPUT_KEYS 则返回 dict，否则返回 str。
    """
    return await call_llm(
        prompt=get_prompt(),
        context=upstream_data,
        model=MODEL,
        output_keys=OUTPUT_KEYS,
    )
'''
                _write(os.path.join(project_dir, "steps", file_name), code)

    def _generate_prompts(self, workflow: Workflow, project_dir: str) -> None:
        """为每个 AI 块生成独立的 prompt 文件"""
        step_index = 0
        for col in workflow.get_sorted_columns():
            for block in col.blocks:
                if block.type != BlockType.PROCESS:
                    continue

                step_index += 1
                prompt_content = block.config.prompt or f"请完成以下任务: {block.name}"

                content = f"""# {block.name}

{prompt_content}
"""
                _write(os.path.join(project_dir, "prompts", f"step_{step_index:02d}.md"), content)

    def _generate_steps_init(self, workflow: Workflow, project_dir: str) -> None:
        """生成 steps/__init__.py"""
        _write(os.path.join(project_dir, "steps", "__init__.py"), "")

    def _generate_requirements(self, project_dir: str) -> None:
        """生成 requirements.txt"""
        content = """# 项目依赖
httpx>=0.27.0
pyyaml>=6.0
"""
        _write(os.path.join(project_dir, "requirements.txt"), content)


def _safe_name(name: str) -> str:
    """将中文/特殊字符名称转换为安全的文件名/标识符"""
    safe = re.sub(r"[^\w\u4e00-\u9fff]", "_", name)
    safe = re.sub(r"_+", "_", safe).strip("_")
    return safe.lower() if safe else "unnamed"


def _write(path: str, content: str) -> None:
    """写入文件"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


_PIPELINE_LLM_CODE = '''"""
LLM 调用层

支持 OpenAI 兼容 API（覆盖绝大多数模型服务）。
配置通过 configure() 设置，或在 config.yaml 中定义。
"""

import json
import os
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class _Config:
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    default_model: str = "gpt-4o-mini"
    timeout: float = 120.0


_config = _Config()


def configure(api_key: str = "", base_url: str = "", default_model: str = "") -> None:
    """配置 LLM 连接参数"""
    global _config
    resolved_key = api_key
    if resolved_key.startswith("$"):
        resolved_key = os.environ.get(resolved_key.lstrip("${}"), "")
    _config = _Config(
        api_key=resolved_key or _config.api_key,
        base_url=base_url or _config.base_url,
        default_model=default_model or _config.default_model,
    )


async def call_llm(
    prompt: str,
    context: str = "",
    model: str | None = None,
    output_keys: list[str] | None = None,
    temperature: float = 0.7,
) -> Any:
    """调用 LLM

    Args:
        prompt: 提示词
        context: 上游数据（自动注入到用户消息中）
        model: 模型名称，None 则使用默认
        output_keys: 若指定，要求 LLM 以 JSON 格式输出
        temperature: 温度

    Returns:
        str 或 dict
    """
    model = model or _config.default_model

    system_parts = ["你是一个专业的 AI 助手。请根据用户的指令完成任务。"]
    if output_keys:
        keys_desc = ", ".join(f\'"{k}"\' for k in output_keys)
        system_parts.append(
            f"\\n请严格以 JSON 格式输出，包含以下 key: {keys_desc}。"
            "\\n只输出 JSON，不要输出其他内容。"
        )
    system_prompt = "\\n".join(system_parts)

    user_parts = [prompt]
    if context:
        user_parts.append(f"\\n---以下是上游数据---\\n{context}")
    user_message = "\\n".join(user_parts)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    async with httpx.AsyncClient(timeout=_config.timeout) as client:
        response = await client.post(
            f"{_config.base_url}/chat/completions",
            json={"model": model, "messages": messages, "temperature": temperature},
            headers={
                "Authorization": f"Bearer {_config.api_key}",
                "Content-Type": "application/json",
            },
        )
        response.raise_for_status()
        data = response.json()
        result_text = data["choices"][0]["message"]["content"]

    if output_keys:
        return _parse_json(result_text)
    return result_text


def _parse_json(text: str) -> dict[str, Any]:
    """尝试从 LLM 输出中解析 JSON"""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        return {"raw_output": text}
'''

_PIPELINE_CONTEXT_CODE = '''"""
执行上下文

管理步骤之间的数据传递：
- 每个步骤的输出自动成为下一个步骤的输入
- 数据格式自动适配（dict → JSON 文本，str → 直接传递）
"""

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class StepResult:
    """单个步骤的执行结果"""
    name: str
    data: Any

    def as_text(self) -> str:
        """格式化为文本"""
        if isinstance(self.data, dict):
            return json.dumps(self.data, ensure_ascii=False, indent=2)
        return str(self.data)


@dataclass
class Context:
    """执行上下文"""
    user_inputs: dict[str, Any] = field(default_factory=dict)
    results: list[StepResult] = field(default_factory=list)

    def add_result(self, name: str, data: Any) -> None:
        self.results.append(StepResult(name=name, data=data))

    def get_upstream_text(self) -> str:
        """获取上一步的输出文本（供下一步使用）"""
        if not self.results:
            return "\\n".join(f"{k}: {v}" for k, v in self.user_inputs.items())
        last = self.results[-1]
        return f"[{last.name}]:\\n{last.as_text()}"

    def get_final_output(self) -> dict[str, Any]:
        """获取最终输出"""
        if not self.results:
            return {}
        last = self.results[-1]
        return {"result": last.data}
'''

_PIPELINE_ENGINE_CODE = '''"""
执行引擎

按步骤顺序执行流水线：
1. 收集输入
2. 逐步执行 AI 步骤（每步接收上一步输出）
3. 返回最终结果
"""

import time
from typing import Any

from pipeline.context import Context


class Engine:
    """流水线执行引擎"""

    def __init__(self, steps: list[dict[str, Any]]):
        self.steps = steps

    async def run(self, user_inputs: dict[str, Any] | None = None) -> dict[str, Any]:
        """执行整个流水线"""
        ctx = Context(user_inputs=user_inputs or {})
        start = time.time()

        try:
            for step in self.steps:
                step_type = step["type"]

                if step_type == "collect":
                    ctx.add_result(step["name"], user_inputs)
                    print(f"  [{step['name']}] 输入已接收")

                elif step_type == "process":
                    upstream = ctx.get_upstream_text()
                    run_fn = step["run"]
                    result = await run_fn(upstream)
                    ctx.add_result(step["name"], result)
                    elapsed = time.time() - start
                    print(f"  [{step['name']}] 完成 ({elapsed:.1f}s)")

                elif step_type == "result":
                    upstream_text = ctx.get_upstream_text()
                    ctx.add_result(step["name"], upstream_text)
                    print(f"  [{step['name']}] 输出就绪")

            return {
                "success": True,
                "output": ctx.get_final_output(),
                "elapsed": round(time.time() - start, 3),
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "elapsed": round(time.time() - start, 3),
            }
'''
