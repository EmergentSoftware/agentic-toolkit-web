import { Toast } from '@base-ui-components/react/toast';

export function useToast(): ReturnType<typeof Toast.useToastManager> {
  return Toast.useToastManager();
}
