// Single place the app gets icons from.
//
// Why not `import { Home } from 'lucide-react'`: that barrel entry re-exports
// ~4,500 icons, and webpack 5 (as shipped in react-scripts 5) fails to resolve
// named imports through it — `react-scripts build` dies with
// "Attempted import error: 'Home' is not exported from 'lucide-react'".
// A namespace import (`import * as icons`) does compile, but it defeats tree
// shaking and drags the entire icon set into the bundle.
//
// Importing each icon's own module keeps named imports working and ships only
// the icons actually used. If lucide-react is upgraded, check that these paths
// still exist.
export { default as Building2 } from 'lucide-react/dist/esm/icons/building-2';
export { default as Calendar } from 'lucide-react/dist/esm/icons/calendar';
export { default as ClipboardList } from 'lucide-react/dist/esm/icons/clipboard-list';
export { default as Edit2 } from 'lucide-react/dist/esm/icons/edit-2';
export { default as Eye } from 'lucide-react/dist/esm/icons/eye';
export { default as EyeOff } from 'lucide-react/dist/esm/icons/eye-off';
export { default as FileText } from 'lucide-react/dist/esm/icons/file-text';
export { default as Home } from 'lucide-react/dist/esm/icons/home';
export { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
export { default as LockKeyhole } from 'lucide-react/dist/esm/icons/lock-keyhole';
export { default as LogOut } from 'lucide-react/dist/esm/icons/log-out';
export { default as Plus } from 'lucide-react/dist/esm/icons/plus';
export { default as Search } from 'lucide-react/dist/esm/icons/search';
export { default as StickyNote } from 'lucide-react/dist/esm/icons/sticky-note';
export { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
export { default as X } from 'lucide-react/dist/esm/icons/x';
