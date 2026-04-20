/**
 * BrandMark —— Lindle 品牌印记
 *
 * 形状沿用早期纺锤造型（两头尖、中段缠丝），但品牌叙事统一后它的读法是：
 *   两块咬合件（上下菱形）+ 中段的连接纹 + 一道抽丝般的动势线。
 *   也就是"积木 + 连接"—— 和 HomePage 里 "Blocks & Joints" 的语言保持一致。
 *
 * - 主笔触跟随当前文字颜色（currentColor），在印章 (`color: var(--ink)`) 里自动呈现墨色。
 * - 斜线用 `var(--rust)`，是整个图标的动势所在，代表"连接"。
 *
 * 用法：<span className="brand-seal"><BrandMark /></span>
 */
interface Props {
  size?: number
}

export function BrandMark({ size = 22 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 主轴 */}
      <line x1="12" y1="3.5" x2="12" y2="20.5" strokeWidth="1.1" />
      {/* 上下两个纺锤头（窄菱形） */}
      <polygon points="12,3.5 13.8,6 12,8.2 10.2,6" strokeWidth="1.4" />
      <polygon points="12,15.8 13.8,18 12,20.5 10.2,18" strokeWidth="1.4" />
      {/* 缠在中段的丝线 */}
      <g strokeWidth="0.9" opacity="0.55">
        <line x1="9.2" y1="9.8" x2="14.8" y2="9.8" />
        <line x1="9.2" y1="11.2" x2="14.8" y2="11.2" />
        <line x1="9.2" y1="12.6" x2="14.8" y2="12.6" />
        <line x1="9.2" y1="14" x2="14.8" y2="14" />
      </g>
      {/* 被抽出的那缕丝 —— 穿越印章的一条斜线 */}
      <line
        x1="5"
        y1="18.5"
        x2="19"
        y2="5.5"
        strokeWidth="1.4"
        style={{ stroke: 'var(--rust)' }}
      />
    </svg>
  )
}
