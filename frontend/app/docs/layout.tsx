'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sections = [
  {
    group: 'Start here',
    items: [{ href: '/docs', label: 'Overview' }],
  },
  {
    group: 'Modules',
    items: [
      { href: '/docs/modules', label: 'How modules work' },
      { href: '/docs/deploy', label: 'Deploy a module' },
    ],
  },
  {
    group: 'Tools',
    items: [
      { href: '/modules', label: 'Module inspector' },
      { href: '/llms.txt', label: 'llms.txt' },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <nav className="space-y-7">
          {sections.map((section) => (
            <div key={section.group}>
              <p className="reg-label mb-3">{section.group}</p>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  const external = item.href.endsWith('.txt');
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        target={external ? '_blank' : undefined}
                        className={`-ml-3 flex items-center border-l-2 py-1 pl-3 text-sm transition-colors ${
                          active
                            ? 'border-blue font-medium text-ink'
                            : 'border-transparent text-muted hover:border-line-strong hover:text-ink'
                        }`}
                      >
                        {item.label}
                        {external && <span className="ml-1 text-faint">↗</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 max-w-2xl pb-10">{children}</article>
    </div>
  );
}
