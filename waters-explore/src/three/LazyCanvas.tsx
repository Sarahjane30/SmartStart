import { Canvas, type CanvasProps } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';

const webglAvailable = (() => {
  let cached: boolean | undefined;
  return () => {
    if (cached !== undefined) return cached;
    try {
      const c = document.createElement('canvas');
      cached = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      cached = false;
    }
    return cached;
  };
})();

interface Props extends Omit<CanvasProps, 'children'> {
  children: ReactNode;
  /** Shown when WebGL is unavailable; the surrounding text must still make sense without it. */
  fallback: ReactNode;
  className?: string;
  label: string;
}

/**
 * Mounts the WebGL canvas the first time it nears the viewport, then pauses rendering while it is
 * off-screen. Staying mounted avoids tearing down drei <Html> roots mid-render.
 */
export function LazyCanvas({ children, fallback, className, label, ...canvasProps }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setNear(e.isIntersecting);
        if (e.isIntersecting) setMounted(true);
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ok = webglAvailable();

  return (
    <div ref={host} className={className} role="img" aria-label={label}>
      {!ok && <div className="canvas-fallback">{fallback}</div>}
      {ok && mounted && (
        <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} frameloop={near ? 'always' : 'never'} {...canvasProps}>
          <Suspense fallback={null}>{children}</Suspense>
        </Canvas>
      )}
    </div>
  );
}
