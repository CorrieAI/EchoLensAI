import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

interface MarkdownProps {
  content: string
  className?: string
}

export function Markdown({ content, className = '' }: MarkdownProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Links
          a: ({ node, ...props }) => (
            <a
              {...props}
              className="text-blue-600 dark:text-blue-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
          // Headings
          h1: ({ node, ...props }) => (
            <h1 {...props} className="text-2xl font-bold mt-8 mb-4 first:mt-0" />
          ),
          h2: ({ node, ...props }) => (
            <h2 {...props} className="text-xl font-bold mt-6 mb-3 first:mt-0" />
          ),
          h3: ({ node, ...props }) => (
            <h3 {...props} className="text-lg font-bold mt-5 mb-2 first:mt-0" />
          ),
          h4: ({ node, ...props }) => (
            <h4 {...props} className="text-base font-bold mt-4 mb-2 first:mt-0" />
          ),
          // Paragraphs
          p: ({ node, ...props }) => (
            <p {...props} className="my-3 leading-relaxed" />
          ),
          // Lists
          ul: ({ node, ...props }) => (
            <ul {...props} className="list-disc list-outside ml-6 my-4 space-y-2" />
          ),
          ol: ({ node, ...props }) => (
            <ol {...props} className="list-decimal list-outside ml-6 my-4 space-y-2" />
          ),
          li: ({ node, ...props }) => (
            <li {...props} className="pl-1" />
          ),
          // Code
          code: ({ node, inline, ...props }: any) =>
            inline ? (
              <code
                {...props}
                className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono"
              />
            ) : (
              <code
                {...props}
                className="block bg-gray-100 dark:bg-gray-800 p-4 rounded text-sm font-mono overflow-x-auto"
              />
            ),
          // Blockquote
          blockquote: ({ node, ...props }) => (
            <blockquote
              {...props}
              className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4"
            />
          ),
          // Table
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table {...props} className="min-w-full border border-gray-300 dark:border-gray-600" />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead {...props} className="bg-gray-100 dark:bg-gray-800" />
          ),
          tbody: ({ node, ...props }) => (
            <tbody {...props} className="divide-y divide-gray-300 dark:divide-gray-600" />
          ),
          tr: ({ node, ...props }) => (
            <tr {...props} className="border-b border-gray-300 dark:border-gray-600" />
          ),
          th: ({ node, ...props }) => (
            <th
              {...props}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-left text-sm font-semibold"
            />
          ),
          td: ({ node, ...props }) => (
            <td {...props} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm" />
          ),
          // Strong/Bold
          strong: ({ node, ...props }) => (
            <strong {...props} className="font-bold" />
          ),
          // Emphasis/Italic
          em: ({ node, ...props }) => (
            <em {...props} className="italic" />
          ),
          // Horizontal Rule
          hr: ({ node, ...props }) => (
            <hr {...props} className="my-6 border-gray-200 dark:border-gray-700" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
