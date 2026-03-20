import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { cn } from '@/lib/utils'

type ChatMarkdownProps = {
  content: string
  /** User bubbles sit on primary; assistant on muted — link/code contrast differs */
  variant: 'user' | 'assistant'
}

export function ChatMarkdown({ content, variant }: ChatMarkdownProps) {
  const isUser = variant === 'user'

  const components: Components = {
    h1: ({ className, ...props }) => (
      <h1
        className={cn(
          'mt-3 mb-2 text-base font-semibold leading-snug first:mt-0',
          className
        )}
        {...props}
      />
    ),
    h2: ({ className, ...props }) => (
      <h2
        className={cn(
          'mt-3 mb-1.5 text-[15px] font-semibold leading-snug first:mt-0',
          className
        )}
        {...props}
      />
    ),
    h3: ({ className, ...props }) => (
      <h3
        className={cn(
          'mt-2.5 mb-1 text-sm font-semibold leading-snug first:mt-0',
          className
        )}
        {...props}
      />
    ),
    h4: ({ className, ...props }) => (
      <h4
        className={cn(
          'mt-2 mb-1 text-sm font-medium leading-snug first:mt-0',
          className
        )}
        {...props}
      />
    ),
    h5: ({ className, ...props }) => (
      <h5
        className={cn(
          'mt-2 mb-1 text-[13px] font-medium leading-snug first:mt-0',
          className
        )}
        {...props}
      />
    ),
    h6: ({ className, ...props }) => (
      <h6
        className={cn(
          'mt-2 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground first:mt-0',
          isUser && 'text-primary-foreground/80',
          className
        )}
        {...props}
      />
    ),
    p: ({ className, ...props }) => (
      <p className={cn('my-2 first:mt-0 last:mb-0 leading-relaxed', className)} {...props} />
    ),
    ul: ({ className, ...props }) => (
      <ul
        className={cn(
          'my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0 [&_input]:mr-1.5',
          className
        )}
        {...props}
      />
    ),
    ol: ({ className, ...props }) => (
      <ol
        className={cn('my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0', className)}
        {...props}
      />
    ),
    li: ({ className, ...props }) => (
      <li className={cn('leading-relaxed', className)} {...props} />
    ),
    blockquote: ({ className, ...props }) => (
      <blockquote
        className={cn(
          'my-2 border-l-2 border-border pl-3 italic text-muted-foreground',
          isUser && 'border-primary-foreground/40 text-primary-foreground/85',
          className
        )}
        {...props}
      />
    ),
    hr: ({ className, ...props }) => (
      <hr className={cn('my-3 border-0 border-t border-border', className)} {...props} />
    ),
    a: ({ className, ...props }) => (
      <a
        className={cn(
          'underline decoration-1 underline-offset-2 break-words',
          isUser
            ? 'text-primary-foreground decoration-primary-foreground/50 hover:opacity-90'
            : 'text-primary decoration-primary/40 hover:opacity-90',
          className
        )}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      />
    ),
    strong: ({ className, ...props }) => (
      <strong className={cn('font-semibold', className)} {...props} />
    ),
    em: ({ className, ...props }) => (
      <em className={cn('italic', className)} {...props} />
    ),
    del: ({ className, ...props }) => (
      <del className={cn('line-through opacity-80', className)} {...props} />
    ),
    code: ({ className, children, ...props }) => {
      // Fenced blocks are <pre><code>; inline backticks never span newlines in CommonMark
      const text = String(children)
      const hasLangClass = typeof className === 'string' && /\blanguage-[\w-]+\b/.test(className)
      const isBlockInner = hasLangClass || text.includes('\n')

      if (!isBlockInner) {
        return (
          <code
            className={cn(
              'rounded px-1 py-0.5 font-mono text-[0.9em]',
              isUser
                ? 'bg-primary-foreground/15 text-primary-foreground'
                : 'bg-background/80 text-foreground ring-1 ring-border/60',
              className
            )}
            {...props}
          >
            {children}
          </code>
        )
      }
      return (
        <code
          className={cn(
            'block w-full max-w-full whitespace-pre-wrap break-words bg-transparent p-0 font-mono text-[0.9em] text-inherit',
            className
          )}
          {...props}
        >
          {children}
        </code>
      )
    },
    pre: ({ className, children, ...props }) => (
      <pre
        className={cn(
          'my-2 overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs leading-relaxed first:mt-0 last:mb-0',
          isUser && 'border-primary-foreground/25 bg-primary-foreground/10',
          className
        )}
        {...props}
      >
        {children}
      </pre>
    ),
    table: ({ className, ...props }) => (
      <div className="my-2 -mx-1 max-w-full overflow-x-auto first:mt-0 last:mb-0">
        <table className={cn('w-full min-w-[12rem] border-collapse text-sm', className)} {...props} />
      </div>
    ),
    thead: (props) => <thead {...props} />,
    tbody: (props) => <tbody {...props} />,
    tr: ({ className, ...props }) => (
      <tr className={cn('border-b border-border last:border-0', className)} {...props} />
    ),
    th: ({ className, ...props }) => (
      <th
        className={cn(
          'border border-border bg-muted/60 px-2.5 py-1.5 text-left font-medium',
          isUser && 'border-primary-foreground/25 bg-primary-foreground/15',
          className
        )}
        {...props}
      />
    ),
    td: ({ className, ...props }) => (
      <td
        className={cn(
          'border border-border px-2.5 py-1.5 align-top',
          isUser && 'border-primary-foreground/25',
          className
        )}
        {...props}
      />
    ),
    img: ({ className, alt, ...props }) => (
      <img
        className={cn('my-2 max-h-64 max-w-full rounded-md object-contain', className)}
        alt={alt ?? ''}
        {...props}
      />
    )
  }

  return (
    <div className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
