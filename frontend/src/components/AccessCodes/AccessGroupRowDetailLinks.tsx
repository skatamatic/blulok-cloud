import { Link, useLocation } from 'react-router-dom';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { withReturnPath } from '@/hooks/useBackNavigation';

export interface AccessGroupDetailLink {
  label: string;
  to: string;
}

interface AccessGroupRowDetailLinksProps {
  links: AccessGroupDetailLink[];
}

export function AccessGroupRowDetailLinks({ links }: AccessGroupRowDetailLinksProps) {
  const location = useLocation();

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
      {links.map((link) => (
        <Link
          key={`${link.label}:${link.to}`}
          to={link.to}
          state={withReturnPath(location)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-primary-600 transition-colors hover:border-primary-200 hover:bg-primary-50 dark:border-gray-600 dark:bg-gray-800 dark:text-primary-400 dark:hover:border-primary-900/50 dark:hover:bg-primary-950/30"
        >
          {link.label}
          <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0" aria-hidden />
        </Link>
      ))}
    </div>
  );
}
