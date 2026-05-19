type Listener = (amount: number, reason: string) => void;
const listeners = new Set<Listener>();

export const auraToastEmitter = {
  emit(amount: number, reason: string) {
    listeners.forEach(l => l(amount, reason));
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
