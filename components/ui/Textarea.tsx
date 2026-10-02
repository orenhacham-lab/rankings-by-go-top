import { cn } from '@/lib/utils'
import { TextareaHTMLAttributes, forwardRef } from 'react'
import { FIELD_CLASSES, FIELD_ERROR_CLASSES, FIELD_LABEL_CLASSES } from './Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className={FIELD_LABEL_CLASSES}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={3}
          aria-invalid={error ? true : undefined}
          className={cn(
            FIELD_CLASSES,
            'py-2.5 resize-none leading-relaxed',
            error && FIELD_ERROR_CLASSES,
            className
          )}
          {...props}
        />
        {error && <p className="text-caption text-bad">{error}</p>}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export default Textarea
