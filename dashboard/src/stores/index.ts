import { usePropertiesStore } from './propertiesStore';
import { useTemplatesStore } from './templatesStore';
import { useShiftNotesStore } from './shiftNotesStore';
import { useAuditLogsStore } from './auditLogsStore';

export { useAuthStore, tokenStore } from './authStore';
export { usePropertiesStore } from './propertiesStore';
export { useTemplatesStore } from './templatesStore';
export { useShiftNotesStore } from './shiftNotesStore';
export { useAuditLogsStore } from './auditLogsStore';

export function resetDataStores() {
  usePropertiesStore.setState(usePropertiesStore.getInitialState(), true);
  useTemplatesStore.setState(useTemplatesStore.getInitialState(), true);
  useShiftNotesStore.setState(useShiftNotesStore.getInitialState(), true);
  useAuditLogsStore.setState(useAuditLogsStore.getInitialState(), true);
}
