// Single place the app gets icons from.
// Re-exported from the lucide-react barrel: Vite tree-shakes named imports,
// and TypeScript gets real types (the per-icon subpath imports had none).
export {
  Building2, Calendar, ClipboardList, Edit2, Eye, EyeOff, FileText, Home,
  Loader2, LockKeyhole, LogOut, Plus, Search, StickyNote, Trash2, X
} from 'lucide-react';

export const AlertTriangle: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
