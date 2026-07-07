// 공지 마크다운 렌더러 — 공개 상세(다크) / 어드민 미리보기(라이트) 공용.
// react-markdown + remark-gfm (표·체크박스·취소선 등 GFM 지원).
// 신뢰된 어드민 작성 콘텐츠 — HTML raw는 허용하지 않음(react-markdown 기본값 = XSS 안전).
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

type Variant = 'dark' | 'light'

function buildComponents(v: Variant): Components {
  const heading = v === 'dark' ? 'text-white' : 'text-zinc-900'
  const body = v === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
  const muted = v === 'dark' ? 'text-zinc-400' : 'text-zinc-500'
  const link = v === 'dark' ? 'text-[#5b9dff]' : 'text-[#0070f3]'
  const codeBg = v === 'dark' ? 'bg-white/10 text-zinc-200' : 'bg-zinc-100 text-zinc-800'
  const preBg = v === 'dark' ? 'bg-black/40 text-zinc-200' : 'bg-zinc-900 text-zinc-100'
  const quote = v === 'dark' ? 'border-white/20 text-zinc-400' : 'border-zinc-300 text-zinc-600'
  const hr = v === 'dark' ? 'border-white/10' : 'border-zinc-200'

  return {
    h1: ({ children }) => <h1 className={`text-2xl font-bold mt-6 mb-3 first:mt-0 ${heading}`}>{children}</h1>,
    h2: ({ children }) => <h2 className={`text-xl font-bold mt-6 mb-3 first:mt-0 ${heading}`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`text-lg font-semibold mt-5 mb-2 first:mt-0 ${heading}`}>{children}</h3>,
    p: ({ children }) => <p className={`text-[15px] leading-relaxed my-3 break-words ${body}`}>{children}</p>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${link} underline underline-offset-2 hover:opacity-80`}>{children}</a>
    ),
    ul: ({ children }) => <ul className={`list-disc pl-5 my-3 space-y-1 text-[15px] ${body}`}>{children}</ul>,
    ol: ({ children }) => <ol className={`list-decimal pl-5 my-3 space-y-1 text-[15px] ${body}`}>{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className={`font-semibold ${heading}`}>{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    blockquote: ({ children }) => <blockquote className={`border-l-2 pl-4 my-4 italic ${quote}`}>{children}</blockquote>,
    hr: () => <hr className={`my-6 border-t ${hr}`} />,
    code: ({ className, children }) => {
      const isBlock = (className ?? '').includes('language-')
      if (isBlock) {
        return <code className={`block ${className ?? ''}`}>{children}</code>
      }
      return <code className={`px-1.5 py-0.5 rounded text-[13px] font-mono ${codeBg}`}>{children}</code>
    },
    pre: ({ children }) => (
      <pre className={`my-4 p-4 rounded-lg overflow-x-auto text-[13px] font-mono ${preBg}`}>{children}</pre>
    ),
    img: ({ src, alt }) =>
      // eslint-disable-next-line @next/next/no-img-element
      <img src={typeof src === 'string' ? src : ''} alt={alt ?? ''} className="rounded-lg max-w-full my-4" />,
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className={`w-full text-sm border-collapse ${body}`}>{children}</table>
      </div>
    ),
    th: ({ children }) => <th className={`border ${hr} px-3 py-1.5 text-left font-semibold ${heading}`}>{children}</th>,
    td: ({ children }) => <td className={`border ${hr} px-3 py-1.5 ${muted}`}>{children}</td>,
  }
}

const DARK = buildComponents('dark')
const LIGHT = buildComponents('light')

export function Markdown({ content, variant = 'dark' }: { content: string; variant?: Variant }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={variant === 'dark' ? DARK : LIGHT}>
      {content}
    </ReactMarkdown>
  )
}
