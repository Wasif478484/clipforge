interface Window {
  clipforge?: {
    openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
    saveFile: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>;
    getRecents: () => Promise<string[]>;
    onMenuAction: (listener: (action: string) => void) => () => void;
  };
}
