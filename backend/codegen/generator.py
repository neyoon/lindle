"""
代码生成器

将工作流定义转换为结构化的 Python 项目。

生成的项目结构:
    my_workflow/
    ├── main.py                 # 入口：流程定义
    ├── config.yaml             # 配置：模型、API Key
    ├── steps/
    │   ├── __init__.py
    │   ├── step_01_xxx.py      # 每个 AI/Tool 块一个文件
    │   └── step_02_xxx.py
    ├── prompts/
    │   ├── xxx.md              # AI 块的 prompt 独立文件
    │   └── yyy.md
    └── requirements.txt

设计目标:
- 生成的代码可以直接 python main.py 运行
- LLM 可以直接阅读文件层次理解整个流程
- 每个文件短小精悍，职责单一
"""

from __future__ import annotations

import os
import re
from typing import Any

from miniflow.models import Block, BlockType, Column, Workflow


class CodeGenerator:
    """将工作流转换为 Python 项目"""

    def generate(self, workflow: Workflow, output_dir: str) -> str:
        """生成完整的 Python 项目

        Args:
            workflow: 工作流定义
            output_dir: 输出目录

        Returns:
            生成的项目根目录路径
        """
        project_dir = os.path.join(output_dir, _safe_name(workflow.name))

        # 创建目录结构
        os.makedirs(os.path.join(project_dir, "steps"), exist_ok=True)
        os.makedirs(os.path.join(project_dir, "prompts"), exist_ok=True)

        # 生成各文件
        self._generate_main(workflow, project_dir)
        self._generate_config(workflow, project_dir)
        self._generate_steps(workflow, project_dir)
        self._generate_prompts(workflow, project_dir)
        self._generate_requirements(project_dir)
        self._generate_steps_init(workflow, project_dir)

        return project_dir

    def _generate_main(self, workflow: Workflow, project_dir: str) -> None:
        """生成 main.py - 流程定义入口"""
        columns = workflow.get_sorted_columns()
        imports: list[str] = []
        flow_lines: list[str] = []

        step_index = 0
        for col in columns:
            blocks_code: list[str] = []
            for block in col.blocks:
                if block.type == BlockType.INPUT:
                    fields = block.config.fields or []
                    field_names = ", ".join(f'"{f.name}"' for f in fields)
                    blocks_code.append(f'    Input("{block.name}", fields=[{field_names}])')

                elif block.type == BlockType.AI:
                    step_index += 1
                    step_name = _safe_name(block.name)
                    func_name = f"step_{step_index:02d}_{step_name}"
                    imports.append(f"from steps.{func_name} import run as {func_name}")
                    schema_arg = ""
                    if block.output_schema and block.output_schema.keys:
                        keys_str = ", ".join(f'"{k}"' for k in block.output_schema.keys)
                        schema_arg = f", output_keys=[{keys_str}]"
                    blocks_code.append(f'    AI("{block.name}", step={func_name}{schema_arg})')

                elif block.type == BlockType.OUTPUT:
                    blocks_code.append(f'    Output("{block.name}")')

            if len(blocks_code) == 1:
                flow_lines.append(blocks_code[0] + ",")
            elif len(blocks_code) > 1:
                inner = ",\n        ".join(b.strip() for b in blocks_code)
                if col.repeat > 1:
                    flow_lines.append(f"    Parallel({inner}, repeat={col.repeat}),")
                else:
                    flow_lines.append(f"    Parallel({inner}),")

        imports_str = "\n".join(imports)
        flow_body = "\n".join(flow_lines)

        code = f'''"""
{workflow.name}
{workflow.description}

自动生成 by MiniFlow
"""
from miniflow import Flow, Input, AI, Output, Parallel

{imports_str}

flow = Flow(
    "{workflow.name}",
{flow_body}
)

if __name__ == "__main__":
    flow.run_interactive()
'''
        _write(os.path.join(project_dir, "main.py"), code)

    def _generate_config(self, workflow: Workflow, project_dir: str) -> None:
        """生成 config.yaml"""
        # 收集用到的模型
        models: set[str] = set()
        for col in workflow.columns:
            for block in col.blocks:
                if block.type == BlockType.AI and block.config.model:
                    models.add(block.config.model)

        default_model = next(iter(models)) if models else "gpt-4o-mini"

        config = f"""# MiniFlow 配置
# 请填写你的 API 配置

llm:
  api_key: "${{OPENAI_API_KEY}}"      # 从环境变量读取，或直接填写
  base_url: "https://api.openai.com/v1"
  default_model: "{default_model}"
"""
        _write(os.path.join(project_dir, "config.yaml"), config)

    def _generate_steps(self, workflow: Workflow, project_dir: str) -> None:
        """为每个 AI 块生成独立的 step 文件"""
        step_index = 0
        for col in workflow.get_sorted_columns():
            for block in col.blocks:
                if block.type != BlockType.AI:
                    continue

                step_index += 1
                step_name = _safe_name(block.name)
                file_name = f"step_{step_index:02d}_{step_name}.py"

                prompt_file = f"{step_name}.md"
                model = block.config.model or "None  # 使用默认模型"

                output_schema_code = "None"
                if block.output_schema and block.output_schema.keys:
                    keys_str = ", ".join(f'"{k}"' for k in block.output_schema.keys)
                    output_schema_code = f"[{keys_str}]"

                code = f'''"""
AI 步骤: {block.name}
"""
from pathlib import Path

# 提示词从独立文件加载
PROMPT_FILE = Path(__file__).parent.parent / "prompts" / "{prompt_file}"

# 模型配置
MODEL = {model}

# 输出结构（JSON key），None 表示自由文本输出
OUTPUT_KEYS = {output_schema_code}


def get_prompt() -> str:
    """加载提示词"""
    return PROMPT_FILE.read_text(encoding="utf-8")


async def run(upstream_data: str) -> str | dict:
    """执行此步骤

    Args:
        upstream_data: 上游块传递的数据（已自动格式化）

    Returns:
        处理结果
    """
    from miniflow.llm import call_llm

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
        for col in workflow.get_sorted_columns():
            for block in col.blocks:
                if block.type != BlockType.AI:
                    continue

                prompt_name = _safe_name(block.name)
                prompt_content = block.config.prompt or f"请完成以下任务: {block.name}"

                content = f"""# {block.name}

{prompt_content}
"""
                _write(os.path.join(project_dir, "prompts", f"{prompt_name}.md"), content)

    def _generate_steps_init(self, workflow: Workflow, project_dir: str) -> None:
        """生成 steps/__init__.py"""
        _write(os.path.join(project_dir, "steps", "__init__.py"), "")

    def _generate_requirements(self, project_dir: str) -> None:
        """生成 requirements.txt"""
        content = """# MiniFlow 依赖
httpx>=0.27.0
pydantic>=2.0.0
pyyaml>=6.0
"""
        _write(os.path.join(project_dir, "requirements.txt"), content)


# ========== 工具函数 ==========


def _safe_name(name: str) -> str:
    """将中文/特殊字符名称转换为安全的文件名/标识符"""
    # 保留中文、字母、数字
    safe = re.sub(r"[^\w\u4e00-\u9fff]", "_", name)
    safe = re.sub(r"_+", "_", safe).strip("_")
    return safe.lower() if safe else "unnamed"


def _write(path: str, content: str) -> None:
    """写入文件"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
