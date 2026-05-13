import { Save, X } from 'lucide-react'
import { useState } from 'react'
import { createTemplate } from '@/api/client'
import { useWorkflowStore } from '@/stores/workflow'
import type { Block, Column } from '@/types/workflow'
import { evaluateFlowHealth } from '@/utils/flowHealth'
import { AIConfig } from './config/AIConfig'
import { ConnectionDisplay } from './config/ConnectionDisplay'
import { Field } from './config/Field'
import { HealthIssuePanel } from './config/HealthIssuePanel'
import { InputConfig } from './config/InputConfig'
import { PluginBlockConfig } from './config/PluginBlockConfig'

export function BlockConfigPanel() {
  const { workflow, selectedBlockId, selectBlock, updateBlock, removeConnection, renameBlockReference } = useWorkflowStore()
  const [saving, setSaving] = useState(false)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateIcon, setTemplateIcon] = useState('')

  let block: Block | null = null
  let blockColumn: Column | null = null
  for (const col of workflow.columns) {
    for (const b of col.blocks) {
      if (b.id === selectedBlockId) {
        block = b
        blockColumn = col
      }
    }
  }

  if (!block || !blockColumn) return null

  const canSaveAsTemplate = block.type !== 'tool'
  const healthIssues = evaluateFlowHealth(workflow).byBlockId[block.id] || []

  const handleSaveAsTemplate = async () => {
    if (!block) return
    const name = templateName.trim() || block.name
    const description = templateDescription.trim()
    const icon = templateIcon.trim()

    setSaving(true)
    try {
      await createTemplate({
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ref: block.ref,
        type: block.type,
        name,
        description,
        icon,
        config: block.config,
        output_schema: block.output_schema || null,
        created_at: new Date().toISOString(),
      })
      alert('模板保存成功！可在制造工坊中查看。')
      setShowTemplateForm(false)
      setTemplateName('')
      setTemplateDescription('')
      setTemplateIcon('')
    } catch (e) {
      alert(`保存失败: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--paper-warm)] px-4 py-3">
        <div>
          <div className="app-kicker no-rule text-[0.62rem] mb-0.5">Step Config</div>
          <h3 className="text-sm font-medium text-[var(--app-text)]" style={{ fontFamily: '"Noto Serif SC", serif' }}>
            {block.name}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {canSaveAsTemplate && (
            <button
              onClick={() => {
                setTemplateName(block.name)
                setTemplateDescription('')
                setTemplateIcon('')
                setShowTemplateForm((v) => !v)
              }}
              disabled={saving}
              className="rounded-sm p-1.5 text-[var(--app-accent-strong)] transition hover:bg-[var(--app-accent-soft)] disabled:opacity-50"
              title="保存为模板"
            >
              <Save size={14} />
            </button>
          )}
          <button onClick={() => selectBlock(null)} className="text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {healthIssues.length > 0 && <HealthIssuePanel issues={healthIssues} />}

        <Field label="名称">
          <input
            className="input-field"
            value={block.name}
            onChange={(e) => updateBlock(block!.id, { name: e.target.value })}
          />
        </Field>

        <Field label="稳定步骤引用">
          <input
            className="input-field font-mono text-xs"
            value={block.ref}
            onChange={(e) => renameBlockReference(block.id, e.target.value)}
            placeholder="draft_summary"
          />
        </Field>

        {canSaveAsTemplate && showTemplateForm && (
          <TemplateForm
            blockName={block.name}
            saving={saving}
            templateName={templateName}
            templateDescription={templateDescription}
            templateIcon={templateIcon}
            onTemplateNameChange={setTemplateName}
            onTemplateDescriptionChange={setTemplateDescription}
            onTemplateIconChange={setTemplateIcon}
            onCancel={() => setShowTemplateForm(false)}
            onSave={handleSaveAsTemplate}
          />
        )}

        {block.connections.length > 0 && (
          <ConnectionDisplay block={block} workflow={workflow} onRemove={removeConnection} />
        )}

        {block.type === 'process' && <AIConfig block={block} />}
        {block.type === 'collect' && <InputConfig block={block} />}
        {block.type === 'tool' && <PluginBlockConfig block={block} />}
        {block.type === 'result' && (
          <div className="rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] p-3 text-sm text-[var(--app-text-soft)]">
            结果步骤无需额外配置。
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateForm({
  blockName,
  saving,
  templateName,
  templateDescription,
  templateIcon,
  onTemplateNameChange,
  onTemplateDescriptionChange,
  onTemplateIconChange,
  onCancel,
  onSave,
}: {
  blockName: string
  saving: boolean
  templateName: string
  templateDescription: string
  templateIcon: string
  onTemplateNameChange: (value: string) => void
  onTemplateDescriptionChange: (value: string) => void
  onTemplateIconChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="rounded-sm border border-[var(--line)] bg-[var(--paper-warm)] p-3 space-y-3">
      <div className="app-kicker no-rule text-[0.62rem]">Save As Template</div>
      <Field label="模板名称">
        <input
          className="input-field"
          value={templateName}
          onChange={(e) => onTemplateNameChange(e.target.value)}
          placeholder={blockName}
        />
      </Field>
      <Field label="模板描述">
        <input
          className="input-field"
          value={templateDescription}
          onChange={(e) => onTemplateDescriptionChange(e.target.value)}
          placeholder="可选"
        />
      </Field>
      <Field label="图标">
        <input
          className="input-field"
          value={templateIcon}
          onChange={(e) => onTemplateIconChange(e.target.value)}
          placeholder="可选"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="app-button app-button-ghost"
          type="button"
        >
          取消
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="app-button app-button-primary disabled:opacity-50"
          type="button"
        >
          保存模板
        </button>
      </div>
    </div>
  )
}
