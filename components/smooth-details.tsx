'use client';
import {
  Children,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
} from 'react';

/** Keep native disclosure semantics while interpolating its measured height. */
export default function SmoothDetails({
  children,
  className = '',
  ...props
}: ComponentPropsWithoutRef<'details'>) {
  const ref = useRef<HTMLDetailsElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const fade = useRef<Animation | null>(null);
  const expanded = useRef(!!props.open);
  useEffect(
    () => () => {
      animation.current?.cancel();
      fade.current?.cancel();
    },
    [],
  );
  const [summary, ...body] = Children.toArray(children);
  return (
    <details
      {...props}
      ref={ref}
      className={'smooth-details ' + className}
      onClick={(event) => {
        props.onClick?.(event);
        const element = ref.current!,
          panel = content.current!;
        const trigger = (event.target as HTMLElement).closest('summary');
        if (event.defaultPrevented || trigger?.parentElement !== element)
          return;
        event.preventDefault();
        const opening = animation.current ? !expanded.current : !element.open;
        expanded.current = opening;
        const start = element.getBoundingClientRect().height;
        const opacity = getComputedStyle(panel).opacity;
        const wasOpen = element.open;
        animation.current?.cancel();
        fade.current?.cancel();
        if (
          matchMedia('(prefers-reduced-motion: reduce)').matches ||
          !element.animate
        ) {
          element.open = opening;
          panel.inert = !opening;
          element.style.overflow = '';
          return;
        }
        const style = getComputedStyle(element);
        const chrome = [
          'paddingTop',
          'paddingBottom',
          'borderTopWidth',
          'borderBottomWidth',
        ].reduce(
          (height, key) =>
            height +
            (parseFloat(style[key as keyof CSSStyleDeclaration] as string) ||
              0),
          0,
        );
        const closedHeight = trigger.getBoundingClientRect().height + chrome;
        // Keep the native content visible until the closing animation finishes.
        element.open = true;
        const end = opening
          ? element.getBoundingClientRect().height
          : closedHeight;
        panel.inert = !opening;
        element.style.overflow = 'clip';
        const duration = style.getPropertyValue('--motion-disclosure').trim();
        const options = {
          duration:
            parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000) || 220,
          fill: 'both' as FillMode,
          easing:
            style.getPropertyValue('--ease-out').trim() ||
            'cubic-bezier(0.23, 1, 0.32, 1)',
        };
        const motion = element.animate(
          [{ height: start + 'px' }, { height: end + 'px' }],
          options,
        );
        animation.current = motion;
        const contentMotion = panel.animate(
          [{ opacity: wasOpen ? opacity : 0 }, { opacity: 1 }],
          options,
        );
        fade.current = contentMotion;
        motion.onfinish = () => {
          if (animation.current !== motion) return;
          element.open = opening;
          element.style.overflow = '';
          motion.cancel();
          contentMotion.cancel();
          animation.current = null;
          fade.current = null;
        };
      }}
    >
      {summary}
      <div ref={content} className="details-body">
        {body}
      </div>
    </details>
  );
}

export function Collapse({
  open,
  children,
  ...props
}: ComponentPropsWithoutRef<'div'> & { open: boolean }) {
  return (
    <div
      {...props}
      className={'smooth-collapse ' + (props.className || '')}
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="collapse-body">{children}</div>
    </div>
  );
}
